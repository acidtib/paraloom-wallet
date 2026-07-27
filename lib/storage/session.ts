import type { WalletKeyPair } from "~lib/crypto/keyManagement"
import type { Account } from "~lib/store/walletStore"

// The decrypted wallet for the current unlocked session, held in
// chrome.storage.session — an in-memory area that is NEVER written to disk and
// is cleared automatically when the browser fully closes. This lets the popup
// (and a respawned MV3 service worker) reopen without re-prompting for the
// password, while the existing idle auto-lock timer still re-locks after
// `autoLockMinutes`. Closing the popup no longer drops the unlocked state.
const SESSION_KEY = "paraloom_session"

// Portable hex helpers (no Buffer) so this module works in both the popup and
// the background service worker, where Buffer may be unavailable.
const toHex = (u: Uint8Array): string =>
  Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("")
const fromHex = (h: string): Uint8Array => {
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

interface SerKeyPair {
  publicKey: string
  secretKey: string
  shieldedAddress: string
  boxPublicKey: string
  boxSecretKey: string
  spendPrivkey: string
}

interface SerAccount {
  index: number
  name: string
  keypair: SerKeyPair
  balance: string
}

interface SerSession {
  wallet: SerKeyPair
  accounts: SerAccount[]
  currentAccountIndex: number
  seedPhrase: string | null
}

export interface WalletSession {
  wallet: WalletKeyPair
  accounts: Account[]
  currentAccountIndex: number
  seedPhrase: string | null
}

const serKp = (k: WalletKeyPair): SerKeyPair => ({
  publicKey: toHex(k.publicKey),
  secretKey: toHex(k.secretKey),
  shieldedAddress: k.shieldedAddress,
  boxPublicKey: toHex(k.boxPublicKey),
  boxSecretKey: toHex(k.boxSecretKey),
  spendPrivkey: toHex(k.spendPrivkey)
})

const deKp = (s: SerKeyPair): WalletKeyPair => ({
  publicKey: fromHex(s.publicKey),
  secretKey: fromHex(s.secretKey),
  shieldedAddress: s.shieldedAddress,
  boxPublicKey: fromHex(s.boxPublicKey),
  boxSecretKey: fromHex(s.boxSecretKey),
  spendPrivkey: fromHex(s.spendPrivkey)
})

export async function saveSession(session: WalletSession): Promise<void> {
  const ser: SerSession = {
    wallet: serKp(session.wallet),
    accounts: session.accounts.map((a) => ({
      index: a.index,
      name: a.name,
      keypair: serKp(a.keypair),
      balance: a.balance.toString()
    })),
    currentAccountIndex: session.currentAccountIndex,
    seedPhrase: session.seedPhrase
  }
  await chrome.storage.session.set({ [SESSION_KEY]: ser })
}

export async function loadSession(): Promise<WalletSession | null> {
  const result = await chrome.storage.session.get(SESSION_KEY)
  const ser = result[SESSION_KEY] as SerSession | undefined
  if (!ser) return null
  return {
    wallet: deKp(ser.wallet),
    accounts: ser.accounts.map((a) => ({
      index: a.index,
      name: a.name,
      keypair: deKp(a.keypair),
      balance: BigInt(a.balance)
    })),
    currentAccountIndex: ser.currentAccountIndex,
    seedPhrase: ser.seedPhrase
  }
}

export async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY)
}
