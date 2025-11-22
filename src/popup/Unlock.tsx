import { useState } from "react"
import {
  decryptWallet,
  decryptSeedPhrase,
  deriveKeypairFromSeed
} from "~lib/crypto/keyManagement"
import { getStoredWallet, setLockState } from "~lib/storage/secure"
import { useWalletStore } from "~lib/store/walletStore"
import type { Account } from "~lib/store/walletStore"

import logoImg from "data-base64:~/../paraloom.png"

interface UnlockProps {
  onUnlock: () => void
}

export function Unlock({ onUnlock }: UnlockProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { unlock, setSeedPhrase, addAccount } = useWalletStore()

  async function handleUnlock() {
    setError("")
    setLoading(true)

    try {
      const stored = await getStoredWallet()
      if (!stored) {
        setError("No wallet found")
        setLoading(false)
        return
      }

      const wallet = decryptWallet(stored.encryptedData, password)

      // Restore seed phrase if available
      let seedPhrase: string | undefined
      if (stored.encryptedSeedPhrase) {
        try {
          seedPhrase = decryptSeedPhrase(stored.encryptedSeedPhrase, password)
          console.log("Seed phrase restored successfully")
        } catch (err) {
          console.error("Failed to decrypt seed phrase:", err)
        }
      } else {
        console.warn("No encrypted seed phrase found in storage")
      }

      // Restore accounts if available
      if (stored.accounts && stored.accounts.length > 0 && seedPhrase) {
        console.log(`Restoring ${stored.accounts.length} accounts...`)
        for (const storedAccount of stored.accounts) {
          const keypair = deriveKeypairFromSeed(seedPhrase, storedAccount.index)
          const account: Account = {
            index: storedAccount.index,
            name: storedAccount.name,
            keypair,
            balance: BigInt(storedAccount.balance)
          }
          addAccount(account)
        }
        console.log("Accounts restored successfully")
      } else {
        console.warn("No accounts to restore or seed phrase missing")
      }

      unlock(wallet, seedPhrase)
      console.log("Seed phrase in store after unlock:", seedPhrase ? "available" : "missing")
      await setLockState(false)

      chrome.runtime.sendMessage({ type: "ACTIVITY" })

      onUnlock()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock")
      setPassword("")
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleUnlock()
    }
  }

  return (
    <div className="container unlock-container">
      <div className="header">
        <div className="logo-container">
          <div className="logo">paraloom</div>
          <img src={logoImg} alt="paraloom" className="logo-image" />
          <div className="subtitle">Welcome Back</div>
        </div>
      </div>

      <div className="unlock-content">
        <div className="unlock-input-group">
          <label className="unlock-label">Enter your password</label>
          <input
            type="password"
            className={`input unlock-input ${error ? 'input-error shake' : ''}`}
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError("")
            }}
            onKeyPress={handleKeyPress}
            autoFocus
          />
        </div>

        <button className="button" onClick={handleUnlock} disabled={loading}>
          {loading ? "Unlocking..." : "Unlock Wallet"}
        </button>
      </div>
    </div>
  )
}
