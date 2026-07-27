import { getAutoLockMinutes, getStoredWallet, isWalletLocked, setLockState } from "~lib/storage/secure"
import { addApprovedOrigin, isOriginApproved, removeApprovedOrigin } from "~lib/storage/connections"
import { clearSession, loadSession } from "~lib/storage/session"
import { shieldedBalance } from "~lib/paraloom/notes"
import { scanForNotes } from "~lib/paraloom/scan"
import { solanaAddress } from "~lib/paraloom/bridge"

let lockTimer: NodeJS.Timeout | null = null
let lastActivity = Date.now()

// Connected dApp state (in-memory only)
let connectedOrigin: string | null = null

// A connection request awaiting the user's explicit approval in the popup
// (Phantom-style). At most one is outstanding at a time.
let pendingConnection:
  | { id: number; origin: string; resolve: (approved: boolean) => void }
  | null = null
let connectionIdCounter = 0

chrome.runtime.onInstalled.addListener(() => {
  startAutoLockTimer()
})

chrome.runtime.onStartup.addListener(() => {
  startAutoLockTimer()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup messages
  if (message.type === "ACTIVITY") {
    lastActivity = Date.now()
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
    // Revoke the site so it must be approved again next time (Phantom-style).
    if (connectedOrigin) removeApprovedOrigin(connectedOrigin)
    connectedOrigin = null
    sendResponse({ success: true })
    return false
  }

  // ── Connection-approval messages (from the popup) ──

  if (message.type === "GET_PENDING_CONNECTION") {
    sendResponse(
      pendingConnection
        ? { id: pendingConnection.id, origin: pendingConnection.origin }
        : null
    )
    return false
  }

  if (message.type === "APPROVE_CONNECTION") {
    if (pendingConnection && pendingConnection.id === message.id) {
      pendingConnection.resolve(true)
    }
    sendResponse({ success: true })
    return false
  }

  if (message.type === "REJECT_CONNECTION") {
    if (pendingConnection && pendingConnection.id === message.id) {
      pendingConnection.resolve(false)
    }
    sendResponse({ success: true })
    return false
  }

  if (message.type === "GET_ADDRESS") {
    handleGetAddress().then(sendResponse).catch(() => {
      sendResponse({ address: null })
    })
    return true
  }

  if (message.type === "IS_CONNECTED") {
    const connected = connectedOrigin !== null
    sendResponse({ connected })
    return false
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
    handleSignMessage(message.message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
    return true
  }

  if (message.type === "SEND_PRIVATE_TRANSFER") {
    handlePrivateTransfer(message.params).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
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
    lastActivity = Date.now()
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
    const stillLocked = await waitForUnlock(90_000)
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
  const approved = await decision
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
    const timer = setTimeout(() => {
      if (pendingConnection?.id === id) {
        pendingConnection = null
        resolve(false)
      }
    }, timeoutMs)
    pendingConnection = {
      id,
      origin,
      resolve: (approved: boolean) => {
        clearTimeout(timer)
        pendingConnection = null
        resolve(approved)
      }
    }
  })
}

// Open the wallet UI in a popup window so the user can unlock to approve a
// connection. chrome.action.openPopup() is unreliable in MV3, so we open the
// popup page as its own window.
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

async function handleGetAddress() {
  if (!connectedOrigin) {
    return { address: null }
  }

  const stored = await getStoredWallet()
  return { address: stored?.address || null }
}

// Authorize a read from the page: the origin must be the live-connected one or
// a previously approved (trusted) site. Resolving against the approved list as
// well keeps reads working if the MV3 service worker was recycled and lost the
// in-memory connectedOrigin.
async function isAuthorizedSender(
  sender: chrome.runtime.MessageSender
): Promise<boolean> {
  const origin =
    sender.origin ?? (sender.tab?.url ? new URL(sender.tab.url).origin : null)
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
    await scanForNotes(addr, session.wallet.boxSecretKey)
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

async function startAutoLockTimer() {
  const minutes = await getAutoLockMinutes()
  const interval = minutes * 60 * 1000

  if (lockTimer) {
    clearInterval(lockTimer)
  }

  lockTimer = setInterval(async () => {
    const locked = await isWalletLocked()
    if (!locked) {
      const timeSinceActivity = Date.now() - lastActivity
      if (timeSinceActivity >= interval) {
        connectedOrigin = null
        await setLockState(true)
        await clearSession()
      }
    }
  }, 30000) // Check every 30s for better accuracy
}

export {}
