import { create } from "zustand"
import type { WalletKeyPair } from "~lib/crypto/keyManagement"

interface WalletState {
  wallet: WalletKeyPair | null
  locked: boolean
  balance: bigint
  lastActivity: number

  setWallet: (wallet: WalletKeyPair) => void
  lock: () => void
  unlock: (wallet: WalletKeyPair) => void
  setBalance: (balance: bigint) => void
  updateActivity: () => void
  clear: () => void
}

export const useWalletStore = create<WalletState>()((set) => ({
  wallet: null,
  locked: true,
  balance: 0n,
  lastActivity: Date.now(),

  setWallet: (wallet) =>
    set({
      wallet,
      locked: false,
      lastActivity: Date.now()
    }),

  lock: () =>
    set({
      wallet: null,
      locked: true
    }),

  unlock: (wallet) =>
    set({
      wallet,
      locked: false,
      lastActivity: Date.now()
    }),

  setBalance: (balance) => set({ balance }),

  updateActivity: () => set({ lastActivity: Date.now() }),

  clear: () =>
    set({
      wallet: null,
      locked: true,
      balance: 0n,
      lastActivity: Date.now()
    })
}))
