import type { EncryptedWallet } from "~lib/crypto/keyManagement"
import { encryptSeedPhrase } from "~lib/crypto/keyManagement"
import type { Account } from "~lib/store/walletStore"

export interface SerializableAccount {
  index: number
  name: string
  address: string
  balance: string
}

export interface StoredWallet {
  encryptedData: EncryptedWallet
  address: string
  createdAt: number
  encryptedSeedPhrase?: string
  accounts?: SerializableAccount[]
}

export interface WalletStorage {
  wallet?: StoredWallet
  locked: boolean
  autoLockMinutes: number
}

const STORAGE_KEY = "paraloom_wallet"

export async function saveEncryptedWallet(
  encryptedWallet: EncryptedWallet,
  address: string,
  seedPhrase?: string,
  password?: string,
  accounts?: Account[]
): Promise<void> {
  const data: StoredWallet = {
    encryptedData: encryptedWallet,
    address,
    createdAt: Date.now()
  }

  // Encrypt and save seed phrase if provided
  if (seedPhrase && password) {
    data.encryptedSeedPhrase = encryptSeedPhrase(seedPhrase, password)
  }

  // Serialize accounts if provided (convert keypair to address, balance to string)
  if (accounts && accounts.length > 0) {
    data.accounts = accounts.map(acc => ({
      index: acc.index,
      name: acc.name,
      address: acc.keypair.shieldedAddress,
      balance: acc.balance.toString()
    }))
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

export async function updateAccounts(accounts: Account[]): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const storage = result[STORAGE_KEY] as WalletStorage

  if (storage?.wallet) {
    storage.wallet.accounts = accounts.map(acc => ({
      index: acc.index,
      name: acc.name,
      address: acc.keypair.shieldedAddress,
      balance: acc.balance.toString()
    }))
    await chrome.storage.local.set({ [STORAGE_KEY]: storage })
  }
}
