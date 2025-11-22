import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { getStoredWallet, isWalletLocked, setLockState } from "~lib/storage/secure"
import { Home } from "~src/popup/Home"
import { Onboarding } from "~src/popup/Onboarding"
import { Unlock } from "~src/popup/Unlock"

import "./style.css"

function Popup() {
  const [hasWallet, setHasWallet] = useState(false)
  const [locked, setLocked] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initWallet()
  }, [])

  async function initWallet() {
    const wallet = await getStoredWallet()

    // Auto-lock on extension open for security (but not on first load)
    if (wallet) {
      const isLocked = await isWalletLocked()
      // Only auto-lock if wallet exists and is already unlocked
      // This ensures security when extension is reopened
      if (!isLocked) {
        await setLockState(true)
      }
    }

    await checkWalletState()
  }

  async function checkWalletState() {
    const wallet = await getStoredWallet()
    const isLocked = await isWalletLocked()

    setHasWallet(!!wallet)
    setLocked(isLocked)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  if (!hasWallet) {
    return (
      <div className="app">
        <Onboarding onComplete={() => checkWalletState()} />
      </div>
    )
  }

  if (locked) {
    return (
      <div className="app">
        <Unlock onUnlock={() => setLocked(false)} />
      </div>
    )
  }

  return (
    <div className="app">
      <Home onLock={() => setLocked(true)} />
    </div>
  )
}

const root = createRoot(document.getElementById("root")!)
root.render(<Popup />)
