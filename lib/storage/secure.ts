import type { EncryptedWallet } from "~lib/crypto/keyManagement"

export interface StoredWallet {
  encryptedData: EncryptedWallet
  address: string
  createdAt: number
}

export interface WalletStorage {
  wallet?: StoredWallet
  locked: boolean
  autoLockMinutes: number
}

const STORAGE_KEY = "paraloom_wallet"

export async function saveEncryptedWallet(
  encryptedWallet: EncryptedWallet,
  address: string
): Promise<void> {
  const data: StoredWallet = {
    encryptedData: encryptedWallet,
    address,
    createdAt: Date.now()
  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      wallet: data,
      locked: true,
      autoLockMinutes: 15
    }
  })
}

export async function getStoredWallet(): Promise<StoredWallet | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storage = result[STORAGE_KEY] as WalletStorage | undefined
  return storage?.wallet || null
}

export async function clearWallet(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

export async function isWalletLocked(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storage = result[STORAGE_KEY] as WalletStorage | undefined
  return storage?.locked ?? true
}

export async function setLockState(locked: boolean): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storage = result[STORAGE_KEY] as WalletStorage

  if (storage) {
    storage.locked = locked
    await chrome.storage.local.set({ [STORAGE_KEY]: storage })
  }
}

export async function getAutoLockMinutes(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storage = result[STORAGE_KEY] as WalletStorage | undefined
  return storage?.autoLockMinutes ?? 15
}

export async function setAutoLockMinutes(minutes: number): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storage = result[STORAGE_KEY] as WalletStorage

  if (storage) {
    storage.autoLockMinutes = minutes
    await chrome.storage.local.set({ [STORAGE_KEY]: storage })
  }
}
