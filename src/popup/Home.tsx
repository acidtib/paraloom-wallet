import { useState } from "react"
import { setLockState } from "~lib/storage/secure"
import { useWalletStore } from "~lib/store/walletStore"

import logoImg from "data-base64:~/../paraloom.png"

interface HomeProps {
  onLock: () => void
}

export function Home({ onLock }: HomeProps) {
  const { wallet, balance, lock } = useWalletStore()
  const [activeTab, setActiveTab] = useState<"send" | "receive">("send")
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")

  async function handleLock() {
    lock()
    await setLockState(true)
    onLock()
  }

  function handleCopyAddress() {
    if (wallet?.shieldedAddress) {
      navigator.clipboard.writeText(wallet.shieldedAddress)
    }
  }

  function formatBalance(balance: bigint): string {
    const lamports = Number(balance)
    const sol = lamports / 1_000_000_000
    return sol.toFixed(4)
  }

  if (!wallet) {
    return (
      <div className="container">
        <div className="error">No wallet loaded</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header">
        <div className="logo-container">
          <div className="logo">paraloom</div>
          <img src={logoImg} alt="paraloom" className="logo-image" />
          <div className="subtitle">Wallet</div>
        </div>
      </div>

      <button className="lock-button" onClick={handleLock}>
        Lock Wallet
      </button>

      <div className="card">
        <div className="balance">{formatBalance(balance)}</div>
        <div className="balance-label">PARA Balance</div>
        <div className="address" onClick={handleCopyAddress}>
          {wallet.shieldedAddress}
        </div>
      </div>

      <div className="tabs">
        <div
          className={`tab ${activeTab === "send" ? "active" : ""}`}
          onClick={() => setActiveTab("send")}>
          Send
        </div>
        <div
          className={`tab ${activeTab === "receive" ? "active" : ""}`}
          onClick={() => setActiveTab("receive")}>
          Receive
        </div>
      </div>

      {activeTab === "send" ? (
        <div className="card">
          <label className="label">Recipient Address</label>
          <input
            type="text"
            className="input"
            placeholder="paraloom1..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />

          <label className="label">Amount</label>
          <input
            type="number"
            className="input"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <button className="button">Send Private Transfer</button>
        </div>
      ) : (
        <div className="card">
          <div className="subtitle">Share your address to receive PARA</div>
          <div className="address" onClick={handleCopyAddress}>
            {wallet.shieldedAddress}
          </div>
          <button className="button button-secondary" onClick={handleCopyAddress}>
            Copy Address
          </button>
        </div>
      )}
    </div>
  )
}
