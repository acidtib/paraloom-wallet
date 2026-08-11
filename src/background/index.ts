import { Connection } from "@solana/web3.js"

import { getAutoLockMinutes, getStoredWallet, isWalletLocked, setLockState } from "~lib/storage/secure"
import { addApprovedOrigin, isOriginApproved, removeApprovedOrigin } from "~lib/storage/connections"
import { clearSession, getLastActivity, loadSession, recordActivity } from "~lib/storage/session"
import { getNotes, shieldedBalance, type ShieldedNote } from "~lib/paraloom/notes"
import { scanForNotes } from "~lib/paraloom/scan"
import { solanaAddress } from "~lib/paraloom/bridge"
import { privateSwap } from "~lib/paraloom/privateSwap"
import { NATIVE_ASSET_HEX } from "~lib/prover"

// Private swaps are mainnet-only (Jupiter liquidity) and rebuilding the v3 tree
// needs an archival RPC, so the swap always runs against the node's archival
// proxy regardless of the wallet's selected network.
const PRIVATE_SWAP_RPC_URL = "https://node.paraloom.io/rpc"

// Connected dApp state (in-memory only)
let connectedOrigin: string | null = null

// Auto-lock under MV3. The old implementation used a `setInterval` and a
// module-scope `lastActivity`, armed only from onInstalled/onStartup — all of
// which die when Chrome terminates the idle service worker (~30s) and respawns
// it on the next message without re-running that init. The timer never fired,
// so the wallet, holding the seed phrase and every secret key in session
// storage, never re-locked. Replaced with a persisted activity timestamp (in
// session storage, see recordActivity/getLastActivity) plus a chrome.alarms
// backstop, and an immediate check on every worker spawn so a worker that was
// dead past the threshold locks the moment it wakes.
const AUTO_LOCK_ALARM = "paraloom-auto-lock"

async function maybeAutoLock(): Promise<void> {
  if (await isWalletLocked()) return
  const last = await getLastActivity()
  if (last === null) {
    // Unlocked but no timestamp yet (e.g. a legacy session): start the clock
    // rather than lock, so we never lock a just-unlocked wallet.
    await recordActivity(Date.now())
    return
  }
  const minutes = await getAutoLockMinutes()
  if (Date.now() - last >= minutes * 60 * 1000) {
    connectedOrigin = null
    await setLockState(true)
    await clearSession()
  }
}

// Registered at top level so they re-register on every worker spawn. The alarm
// is the backstop while the worker is alive-but-idle; the immediate call is the
// backstop for a worker that was terminated past the lock threshold.
chrome.alarms.create(AUTO_LOCK_ALARM, { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) void maybeAutoLock()
})
void maybeAutoLock()

// A connection request awaiting the user's explicit approval in the popup
// (Phantom-style). At most one is outstanding at a time.
let pendingConnection:
  | { id: number; origin: string; resolve: (approved: boolean) => void }
  | null = null
let connectionIdCounter = 0

// A private-swap request awaiting the user's explicit per-request approval in
// the popup. A swap SPENDS shielded funds, so it must never proceed on the
// ambient connection alone — the user approves the exact amount + output token
// every time, exactly like a connection approval but for a spend. At most one
// is outstanding at a time.
interface SwapRequestParams {
  outputMint: string
  /** lamports as a decimal string (BigInt doesn't cross the message bridge). */
  amountLamports: string
  slippageBps?: number
}
let pendingSwap:
  | {
      id: number
      origin: string
      params: SwapRequestParams
      resolve: (approved: boolean) => void
    }
  | null = null
let swapIdCounter = 0


// Message types the popup UI is the only legitimate sender of. A page relayed
// through the content script must never reach these: `GET_PENDING_CONNECTION`
// leaks the id of a connection awaiting approval, and `APPROVE_CONNECTION` /
// `REJECT_CONNECTION` resolve it — so a page that could send them would read
// the pending id and approve its own connection, defeating the consent screen
// entirely.
//
// A popup message carries no `sender.tab` (it originates from the extension's
// own context); a content-script message always carries the tab it came from.
// That is the distinction, and it needs no extra permission to read.
const POPUP_ONLY_TYPES = new Set([
  "ACTIVITY",
  "GET_WALLET_STATE",
  "LOCK_WALLET",
  "GET_PENDING_CONNECTION",
  "APPROVE_CONNECTION",
  "REJECT_CONNECTION",
  // Swap approval — same reasoning as the connection ones: a page that could
  // send these would read the pending swap id and approve its own spend,
  // defeating the per-request consent screen.
  "GET_PENDING_SWAP",
  "APPROVE_SWAP",
  "REJECT_SWAP"
])

function isFromPopup(sender: chrome.runtime.MessageSender): boolean {
  // A message from the extension's OWN pages (the popup) carries a
  // chrome-extension:// URL; a page relay (content script) carries the web
  // page's https:// URL. The old `sender.tab === undefined` heuristic was WRONG:
  // openWalletWindow opens the popup via chrome.windows.create, which IS a tab,
  // so every popup-only message (GET_PENDING_CONNECTION / APPROVE_CONNECTION /
  // GET_PENDING_SWAP / APPROVE_SWAP) was rejected as "not permitted" — the
  // approval popup could never read or resolve its own request.
  return !!sender.url && sender.url.startsWith(chrome.runtime.getURL(""))
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup-only messages are refused outright when they arrive from a page.
  // Without this the approval screen is decorative: a script on any injected
  // origin approves its own connection and reads the visitor's shielded
  // balance with no interaction.
  if (POPUP_ONLY_TYPES.has(message.type) && !isFromPopup(sender)) {
    sendResponse({ success: false, error: "not permitted" })
    return false
  }

  // Popup messages
  if (message.type === "ACTIVITY") {
    void recordActivity(Date.now())
    sendResponse({ success: true })
    return false
  }

  if (message.type === "GET_WALLET_STATE") {
    isWalletLocked().then((locked) => {
      sendResponse({ locked })
    })
    return true
  }

  if (message.type === "LOCK_WALLET") {
    connectedOrigin = null
    Promise.all([setLockState(true), clearSession()]).then(() => {
      sendResponse({ success: true })
    })
    return true
  }

  // ── dApp API messages (from content script) ──

  if (message.type === "CONNECT_WALLET") {
    handleConnect(sender).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
    return true
  }

  if (message.type === "DISCONNECT_WALLET") {
    // A page may only disconnect ITSELF. Without the sender check any injected
    // *.paraloom.io page could revoke a different connected origin's approval
    // and force a surprise re-approval prompt (same #711/#719 shape). Revoke
    // only when the caller is the connected origin.
    const origin = senderOrigin(sender)
    if (origin && connectedOrigin === origin) {
      removeApprovedOrigin(connectedOrigin)
      connectedOrigin = null
    }
    sendResponse({ success: true })
    return false
  }

  // ── Connection-approval messages (from the popup) ──

  if (message.type === "GET_PENDING_CONNECTION") {
    // Read from persisted storage so the approval screen still appears even if
    // the worker was recycled after the request was registered.
    chrome.storage.session
      .get("pendingConn")
      .then((r) => sendResponse((r.pendingConn as { id: number; origin: string } | undefined) ?? null))
      .catch(() => sendResponse(null))
    return true
  }

  if (message.type === "APPROVE_CONNECTION") {
    // Record the approval from PERSISTED pending state, so it works even in a
    // worker that respawned after the original CONNECT_WALLET handler (and its
    // in-memory pendingConnection + held response) were evicted mid-wait. The
    // page confirms the connection by polling isConnected(), which reads this
    // durable approval — no reliance on a held response surviving the wait.
    chrome.storage.session
      .get("pendingConn")
      .then(async (r) => {
        const pc = r.pendingConn as { id: number; origin: string } | undefined
        if (pc && pc.id === message.id) {
          connectedOrigin = pc.origin
          await addApprovedOrigin(pc.origin)
          await chrome.storage.session.remove("pendingConn").catch(() => {})
          if (pendingConnection && pendingConnection.id === message.id) {
            pendingConnection.resolve(true)
          }
        }
        sendResponse({ success: true })
      })
      .catch(() => sendResponse({ success: true }))
    return true
  }

  if (message.type === "REJECT_CONNECTION") {
    void chrome.storage.session.remove("pendingConn").catch(() => {})
    if (pendingConnection && pendingConnection.id === message.id) {
      pendingConnection.resolve(false)
    }
    sendResponse({ success: true })
    return false
  }

  // ── Swap-approval messages (from the popup only) ──

  if (message.type === "GET_PENDING_SWAP") {
    sendResponse(
      pendingSwap
        ? { id: pendingSwap.id, origin: pendingSwap.origin, params: pendingSwap.params }
        : null
    )
    return false
  }

  if (message.type === "APPROVE_SWAP") {
    if (pendingSwap && pendingSwap.id === message.id) {
      pendingSwap.resolve(true)
    }
    sendResponse({ success: true })
    return false
  }

  if (message.type === "REJECT_SWAP") {
    if (pendingSwap && pendingSwap.id === message.id) {
      pendingSwap.resolve(false)
    }
    sendResponse({ success: true })
    return false
  }

  if (message.type === "GET_ADDRESS") {
    handleGetAddress(sender).then(sendResponse).catch(() => {
      sendResponse({ address: null })
    })
    return true
  }

  if (message.type === "IS_CONNECTED") {
    // Per-sender, not the global flag: an unapproved page must not learn that
    // some other origin has a live connection (a fingerprinting signal).
    isAuthorizedSender(sender)
      .then((connected) => sendResponse({ connected }))
      .catch(() => sendResponse({ connected: false }))
    return true
  }

  if (message.type === "GET_PUBLIC_ADDRESS") {
    handlePublicAddress(sender).then(sendResponse).catch(() => {
      sendResponse({ address: null })
    })
    return true
  }

  if (message.type === "GET_SHIELDED_BALANCE") {
    handleShieldedBalance(sender).then(sendResponse).catch(() => {
      sendResponse({ lamports: null })
    })
    return true
  }

  if (message.type === "SIGN_MESSAGE") {
    // Gate on the sender, not just "some origin is connected" (the #719 shape).
    // Both handlers are stubbed today, but this is the sign/spend path — it must
    // never ride the ambient connection from an unapproved origin once wired.
    // NOTE before un-stubbing: also add a per-request approval screen showing
    // the exact message / recipient / amount, so a spend can never happen
    // without the user seeing it.
    isAuthorizedSender(sender)
      .then((ok) => {
        if (!ok) return sendResponse({ success: false, error: "not authorized" })
        handleSignMessage(message.message)
          .then(sendResponse)
          .catch((err) => sendResponse({ success: false, error: err.message }))
      })
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (message.type === "SEND_PRIVATE_TRANSFER") {
    isAuthorizedSender(sender)
      .then((ok) => {
        if (!ok) return sendResponse({ success: false, error: "not authorized" })
        handlePrivateTransfer(message.params)
          .then(sendResponse)
          .catch((err) => sendResponse({ success: false, error: err.message }))
      })
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (message.type === "PRIVATE_SWAP") {
    // A spend: authorized sender + explicit per-request approval, both required.
    handlePrivateSwapRequest(message.params, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  return false
})

async function handleConnect(sender: chrome.runtime.MessageSender) {
  // sender.origin is the origin of the page that called window.paraloom.connect
  // (set for content-script senders without needing the "tabs" permission).
  const origin =
    sender.origin ?? (sender.tab?.url ? new URL(sender.tab.url).origin : null)
  if (!origin) {
    throw new Error("Unable to determine the requesting site's origin")
  }

  const stored = await getStoredWallet()
  if (!stored) {
    throw new Error("No wallet found")
  }

  const succeed = () => {
    connectedOrigin = origin
    void recordActivity(Date.now())
    return {
      success: true,
      data: {
        address: stored.address,
        publicKey: stored.address // shielded address as identifier
      }
    }
  }

  const alreadyApproved = await isOriginApproved(origin)
  const locked = await isWalletLocked()

  // Trusted site that's already unlocked → reconnect silently (Phantom-style).
  if (alreadyApproved && !locked) {
    return succeed()
  }

  // Trusted site but locked → only needs an unlock, no approval prompt.
  if (alreadyApproved) {
    await openWalletWindow()
    const stillLocked = await withKeepAlive(waitForUnlock(90_000))
    if (stillLocked) {
      throw new Error("Connection request timed out — unlock the wallet and try again.")
    }
    return succeed()
  }

  // First-time (or revoked) site: register the approval request BEFORE opening
  // the window so the popup finds it the instant the user unlocks — otherwise
  // the popup could query for a pending request before it exists and fall
  // through to the Home screen. The user approves on the (post-unlock) screen.
  const decision = requestApproval(origin, 120_000)
  await openWalletWindow()
  const approved = await withKeepAlive(decision)
  if (!approved) {
    throw new Error("Connection request rejected")
  }
  await addApprovedOrigin(origin)
  return succeed()
}

// Register a pending connection request and resolve once the user approves or
// rejects it in the popup (or the timeout elapses → treated as a rejection).
function requestApproval(origin: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++connectionIdCounter
    const clearPersisted = () =>
      void chrome.storage.session.remove("pendingConn").catch(() => {})
    const timer = setTimeout(() => {
      if (pendingConnection?.id === id) {
        pendingConnection = null
        clearPersisted()
        resolve(false)
      }
    }, timeoutMs)
    pendingConnection = {
      id,
      origin,
      resolve: (approved: boolean) => {
        clearTimeout(timer)
        pendingConnection = null
        clearPersisted()
        resolve(approved)
      }
    }
    // Persist so the pending approval survives an MV3 worker eviction during the
    // wait: the popup reads it via GET_PENDING_CONNECTION and APPROVE_CONNECTION
    // records the approval from it, even in a freshly respawned worker.
    void chrome.storage.session.set({ pendingConn: { id, origin } }).catch(() => {})
  })
}

// Open the wallet UI in a popup window so the user can unlock to approve a
// connection. chrome.action.openPopup() is unreliable in MV3, so we open the
// popup page as its own window.
// MV3 keep-alive. A connect/swap approval waits on the user (unlock + approve),
// which can take longer than Chrome's ~30s idle eviction of the service worker.
// If the worker is evicted mid-wait, the in-memory pending request AND the held
// `sendResponse` are lost, so the page's connect()/privateSwap() never gets a
// reply and hangs forever. Pinging a chrome API every 20s resets the eviction
// timer for the duration of the wait, keeping the worker (and the pending state)
// alive until the user decides.
function withKeepAlive<T>(p: Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => {})
  }, 20_000)
  return p.finally(() => clearInterval(timer))
}

let openingWindow = false
async function openWalletWindow() {
  if (openingWindow) return
  openingWindow = true
  const WIDTH = 400
  const HEIGHT = 620
  try {
    // Anchor the popup to the top-right of the focused browser window, like
    // Phantom — otherwise Chrome drops it at the top-left of the screen.
    let left: number | undefined
    let top: number | undefined
    try {
      const win = await chrome.windows.getLastFocused()
      if (typeof win.left === "number" && typeof win.width === "number") {
        left = Math.max(0, win.left + win.width - WIDTH - 24)
        top = (win.top ?? 0) + 24
      }
    } catch {
      // Fall back to Chrome's default placement.
    }
    await chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: WIDTH,
      height: HEIGHT,
      left,
      top,
      focused: true
    })
  } catch {
    // Ignore — the user can still open the wallet manually from the toolbar.
  } finally {
    openingWindow = false
  }
}

// Poll the lock state until the wallet is unlocked or the timeout elapses.
// Resolves to the final locked state (false = unlocked).
function waitForUnlock(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = async () => {
      if (!(await isWalletLocked())) return resolve(false)
      if (Date.now() - start >= timeoutMs) return resolve(true)
      setTimeout(check, 400)
    }
    check()
  })
}

async function handleGetAddress(sender: chrome.runtime.MessageSender) {
  // Gate on the sender, not just on "some origin is connected" (#719). The
  // page-facing address getters must match: `handlePublicAddress` and
  // `handleShieldedBalance` both require `isAuthorizedSender`, and this one
  // used only `connectedOrigin !== null`, so any injected origin could read
  // the connected site's shielded address without being approved itself.
  if (!(await isAuthorizedSender(sender))) {
    return { address: null }
  }

  const stored = await getStoredWallet()
  return { address: stored?.address || null }
}

// Authorize a read from the page: the origin must be the live-connected one or
// a previously approved (trusted) site. Resolving against the approved list as
// well keeps reads working if the MV3 service worker was recycled and lost the
// in-memory connectedOrigin.
// The requesting page's origin, resolved without the "tabs" permission. A popup
// (extension context) has no tab; a content-script relay always does.
function senderOrigin(sender: chrome.runtime.MessageSender): string | null {
  return sender.origin ?? (sender.tab?.url ? new URL(sender.tab.url).origin : null)
}

async function isAuthorizedSender(
  sender: chrome.runtime.MessageSender
): Promise<boolean> {
  const origin = senderOrigin(sender)
  if (!origin) return false
  if (connectedOrigin === origin) return true
  return isOriginApproved(origin)
}

async function handlePublicAddress(sender: chrome.runtime.MessageSender) {
  if (!(await isAuthorizedSender(sender))) return { address: null }
  const session = await loadSession()
  if (!session) return { address: null }
  return { address: solanaAddress(session.wallet.publicKey) }
}

async function handleShieldedBalance(sender: chrome.runtime.MessageSender) {
  if (!(await isAuthorizedSender(sender))) return { lamports: null }
  const session = await loadSession()
  if (!session) return { lamports: null }

  const addr = session.wallet.shieldedAddress
  // Best-effort refresh from the node; if it fails we still return whatever
  // notes have already been scanned into storage.
  try {
    await scanForNotes(
      addr,
      session.wallet.boxSecretKey,
      Buffer.from(session.wallet.spendPrivkey).toString("hex")
    )
  } catch {}
  const bal = await shieldedBalance(addr)
  return { lamports: bal.toString() }
}

async function handleSignMessage(_message: string) {
  if (!connectedOrigin) {
    throw new Error("Not connected")
  }

  throw new Error("Paraloom Network is not yet live. Signing will be available at mainnet launch.")
}

async function handlePrivateTransfer(_params: { recipient: string; amount: number; memo?: string }) {
  if (!connectedOrigin) {
    throw new Error("Not connected")
  }

  throw new Error("Paraloom Network is not yet live. Transfers will be available at mainnet launch.")
}

// Register a pending swap approval and resolve once the user approves/rejects it
// in the popup (or the timeout elapses → rejection). Mirrors requestApproval.
function requestSwapApproval(
  origin: string,
  params: SwapRequestParams,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++swapIdCounter
    const timer = setTimeout(() => {
      if (pendingSwap?.id === id) {
        pendingSwap = null
        resolve(false)
      }
    }, timeoutMs)
    pendingSwap = {
      id,
      origin,
      params,
      resolve: (approved: boolean) => {
        clearTimeout(timer)
        pendingSwap = null
        resolve(approved)
      }
    }
  })
}

// Page-facing entry: authorize the caller, get explicit per-request approval,
// then execute. No spend happens without BOTH an approved origin AND a fresh
// user confirmation of the exact amount + output token.
async function handlePrivateSwapRequest(
  params: SwapRequestParams,
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!(await isAuthorizedSender(sender))) {
    return { success: false, error: "not authorized" }
  }
  const origin = senderOrigin(sender)
  if (!origin) return { success: false, error: "unknown origin" }
  if (!params || typeof params.outputMint !== "string" || typeof params.amountLamports !== "string") {
    return { success: false, error: "invalid params" }
  }

  // Show the approval window (the popup requires unlock before it renders the
  // approval, so a locked wallet can never auto-approve). Register the pending
  // request BEFORE opening so the popup finds it immediately after unlock.
  const decision = requestSwapApproval(origin, params, 180_000)
  await openWalletWindow()
  const approved = await withKeepAlive(decision)
  if (!approved) return { success: false, error: "rejected" }

  // Keep the worker alive across the whole swap (withdraw settlement + Jupiter,
  // up to ~2-3 min), not just the approval — otherwise the worker is evicted
  // mid-swap, the held response is dropped ("message channel closed"), and the
  // swap is cut off before it can finish and persist its output.
  return withKeepAlive(handlePrivateSwap(params))
}

// The actual spend. Runs only after handlePrivateSwapRequest approved it.
async function handlePrivateSwap(
  params: SwapRequestParams
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const session = await loadSession()
  if (!session) throw new Error("wallet is locked")

  const amount = BigInt(params.amountLamports)
  if (amount <= 0n) throw new Error("amount must be > 0")

  const shieldedAddress = session.wallet.shieldedAddress
  const spendPrivkeyHex = Buffer.from(session.wallet.spendPrivkey).toString("hex")
  const ownBoxPubHex = Buffer.from(session.wallet.boxPublicKey).toString("hex")

  const notes = (await getNotes(shieldedAddress)).filter(
    (n) => !n.spent && n.assetId === NATIVE_ASSET_HEX
  )
  const inputs = selectNotes(notes, amount)

  const connection = new Connection(PRIVATE_SWAP_RPC_URL, "confirmed")
  const result = await privateSwap(
    connection,
    shieldedAddress,
    spendPrivkeyHex,
    ownBoxPubHex,
    inputs,
    {
      outputMint: params.outputMint,
      amountLamports: amount,
      slippageBps: params.slippageBps ?? 100
    }
  )

  // The fresh key + output are persisted inside privateSwap the instant the swap
  // is submitted (before confirmation), so a late failure can never strand the
  // bought token — nothing to save again here.
  void recordActivity(Date.now())

  return {
    success: true,
    data: {
      freshAddress: result.freshAddress,
      swapSignature: result.swapSignature,
      outAmount: result.outAmount
    }
  }
}

// Pick up to two unspent native notes covering `amount` (spendV3 spends 1–2 and
// returns change). Largest-first keeps the note count minimal.
function selectNotes(notes: ShieldedNote[], amount: bigint): ShieldedNote[] {
  if (notes.length === 0) throw new Error("no shielded notes to spend")
  const sorted = [...notes].sort((a, b) => {
    const d = BigInt(b.amount) - BigInt(a.amount)
    return d > 0n ? 1 : d < 0n ? -1 : 0
  })
  const chosen: ShieldedNote[] = []
  let sum = 0n
  for (const n of sorted) {
    chosen.push(n)
    sum += BigInt(n.amount)
    if (sum >= amount) return chosen
    if (chosen.length === 2) break
  }
  throw new Error("insufficient shielded balance for this amount (max 2 notes per swap)")
}

export {}
