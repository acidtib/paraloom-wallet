import { useState } from "react"
import { setLockState, updateAccounts } from "~lib/storage/secure"
import { useWalletStore } from "~lib/store/walletStore"
import { deriveKeypairFromSeed } from "~lib/crypto/keyManagement"
import type { Account } from "~lib/store/walletStore"

import logoImg from "data-base64:~/../paraloom.png"

interface Token {
  symbol: string
  name: string
  balance: bigint
  usdValue: number
  decimals: number
}

interface HomeProps {
  onLock: () => void
}

export function Home({ onLock }: HomeProps) {
  const { wallet, balance, lock, seedPhrase, accounts, addAccount, switchAccount, currentAccountIndex } = useWalletStore()
  const [bottomTab, setBottomTab] = useState<"home" | "activity">("home")
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [showSendModal, setShowSendModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [addAccountMethod, setAddAccountMethod] = useState<"create" | "import" | null>(null)
  const [accountName, setAccountName] = useState("")

  // Mock tokens - will be fetched from backend later
  const tokens: Token[] = [
    {
      symbol: "PARA",
      name: "Paraloom",
      balance: balance,
      usdValue: 0, // Mock USD value
      decimals: 9
    }
    // Additional tokens will be added here
  ]

  // Select first token as default
  const currentToken = selectedToken || tokens[0]

  async function handleLock() {
    lock()
    await setLockState(true)
    onLock()
  }

  function handleCopyAddress() {
    if (wallet?.shieldedAddress) {
      navigator.clipboard.writeText(wallet.shieldedAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function formatBalance(balance: bigint, decimals: number): string {
    const units = Number(balance)
    const divisor = Math.pow(10, decimals)
    return (units / divisor).toFixed(4)
  }

  function formatUSD(amount: number): string {
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }

  function getTotalPortfolioValue(): number {
    // Currently returns 0, real USD values will be calculated later
    return tokens.reduce((total, token) => total + token.usdValue, 0)
  }

  async function handleCreateAccount() {
    if (!seedPhrase) {
      alert("No seed phrase available")
      return
    }

    try {
      // Find new account index
      const newIndex = accounts.length

      // Derive new keypair
      const keypair = deriveKeypairFromSeed(seedPhrase, newIndex)

      // Create account object
      const newAccount: Account = {
        index: newIndex,
        name: accountName || `Account ${newIndex + 1}`,
        keypair,
        balance: 0n
      }

      // Add to store
      addAccount(newAccount)

      // Save updated account list to storage
      const updatedAccounts = [...accounts, newAccount]
      await updateAccounts(updatedAccounts)

      // Switch to new account
      switchAccount(newIndex)

      // Close modal
      setShowAddAccount(false)
      setAddAccountMethod(null)
      setAccountName("")

      console.log(`Account created: ${newAccount.name}`)
    } catch (error) {
      console.error("Failed to create account:", error)
      alert("Failed to create account")
    }
  }

  if (!wallet) {
    return (
      <div className="container">
        <div className="error">No wallet loaded</div>
      </div>
    )
  }

  function shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Get current account info
  const currentAccount = accounts.find(acc => acc.index === currentAccountIndex) || accounts[0]
  const currentAccountName = currentAccount?.name || "Account 1"
  const currentAccountBadge = currentAccount ? `A${currentAccount.index + 1}` : "A1"

  return (
    <div className="wallet-layout">
      {/* Compact Header */}
      <div className="wallet-header">
        <div className="header-content">
          <div className="account-switcher-trigger" onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}>
            <div className="account-badge">{currentAccountBadge}</div>
            <div className="account-details">
              <div className="account-name">{currentAccountName}</div>
              <div className="account-address-short">
                {wallet?.shieldedAddress ? shortenAddress(wallet.shieldedAddress) : ''}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`dropdown-icon ${showAccountSwitcher ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div className="header-actions">
            <button className="header-btn" onClick={handleCopyAddress} title={copied ? "Copied!" : "Copy address"}>
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
            <button className="header-btn" onClick={handleLock} title="Lock">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Account Switcher Dropdown */}
        {showAccountSwitcher && (
          <div className="account-dropdown">
            <div className="account-dropdown-header">
              <span>My Accounts</span>
              <button className="close-dropdown" onClick={() => setShowAccountSwitcher(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="account-list">
              {accounts.map((account) => (
                <div
                  key={account.index}
                  className={`account-item ${account.index === currentAccountIndex ? 'active' : ''}`}
                  onClick={() => {
                    if (account.index !== currentAccountIndex) {
                      switchAccount(account.index)
                    }
                    setShowAccountSwitcher(false)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="account-item-badge">A{account.index + 1}</div>
                  <div className="account-item-info">
                    <div className="account-item-name">{account.name}</div>
                    <div className="account-item-balance">{formatBalance(account.balance, 9)} PARA</div>
                  </div>
                  {account.index === currentAccountIndex && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="check-icon">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </div>
              ))}
              <button className="add-account-item" onClick={() => {
                setShowAccountSwitcher(false)
                setShowAddAccount(true)
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add Account</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="wallet-content">
        {bottomTab === "home" ? (
          <>
            {/* Portfolio Section */}
            <div className="portfolio-card">
              <div className="portfolio-header">
                <div className="portfolio-label">Total Balance</div>
                <div className="portfolio-amount">{formatUSD(getTotalPortfolioValue())}</div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                <button className="action-button" onClick={() => setShowReceiveModal(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <polyline points="19 12 12 19 5 12"></polyline>
                  </svg>
                  <span className="action-button-label">Receive</span>
                </button>
                <button className="action-button" onClick={() => setShowSendModal(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                  <span className="action-button-label">Send</span>
                </button>
              </div>
            </div>

            {/* Tokens Section */}
            <div className="tokens-section">
              <div className="section-header">
                <div className="section-title">Assets</div>
                <div className="token-count">{tokens.length}</div>
              </div>
              <div className="tokens-list">
                {tokens.map((token) => (
                  <div
                    key={token.symbol}
                    className={`token-card ${currentToken.symbol === token.symbol ? 'selected' : ''}`}
                    onClick={() => setSelectedToken(token)}>
                    <div className="token-main">
                      <div className="token-icon">
                        <img src={logoImg} alt={token.symbol} className="token-logo" />
                      </div>
                      <div className="token-info">
                        <div className="token-symbol">{token.symbol}</div>
                        <div className="token-name">{token.name}</div>
                      </div>
                    </div>
                    <div className="token-balance-section">
                      <div className="token-balance">{formatBalance(token.balance, token.decimals)}</div>
                      <div className="token-usd">{formatUSD(token.usdValue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="activity-content">
            <div className="empty-state">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <div className="empty-title">No Activity Yet</div>
              <div className="empty-subtitle">Your transaction history will appear here</div>
            </div>
          </div>
        )}
      </div>

      {/* Add Account Modal */}
      {showAddAccount && (
        <div className="modal-overlay" onClick={() => {
          setShowAddAccount(false)
          setAddAccountMethod(null)
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Account</h2>
              <button className="modal-close" onClick={() => {
                setShowAddAccount(false)
                setAddAccountMethod(null)
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {!addAccountMethod ? (
              <div className="add-account-options">
                <button className="add-account-option" onClick={() => setAddAccountMethod("create")}>
                  <div className="option-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="16"></line>
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                  </div>
                  <div className="option-info">
                    <div className="option-title">Create New Account</div>
                    <div className="option-description">Generate from existing wallet</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="option-arrow">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>

                <button className="add-account-option" onClick={() => setAddAccountMethod("import")}>
                  <div className="option-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </div>
                  <div className="option-info">
                    <div className="option-title">Import Account</div>
                    <div className="option-description">Import with private key</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="option-arrow">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            ) : addAccountMethod === "create" ? (
              <div className="add-account-form">
                <div className="form-info-compact">
                  <p className="form-message">A new account will be generated from your existing wallet using a different derivation path.</p>
                </div>
                <div className="input-group">
                  <label className="label">Account Name (Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Trading Account, Savings..."
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                  <span className="input-hint">Default: Account 2</span>
                </div>
                <div className="form-actions">
                  <button className="button button-secondary" onClick={() => {
                    setAddAccountMethod(null)
                    setAccountName("")
                  }}>
                    Back
                  </button>
                  <button className="button" onClick={handleCreateAccount}>Create Account</button>
                </div>
              </div>
            ) : (
              <div className="add-account-form">
                <div className="input-group">
                  <label className="label">Private Key</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Enter your private key"
                  />
                  <span className="input-hint">Your private key will be encrypted and stored securely</span>
                </div>
                <div className="input-group">
                  <label className="label">Account Name (Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Imported Account"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button className="button button-secondary" onClick={() => {
                    setAddAccountMethod(null)
                    setAccountName("")
                  }}>
                    Back
                  </button>
                  <button className="button">Import Account</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button
          className={`nav-item ${bottomTab === "home" ? "active" : ""}`}
          onClick={() => setBottomTab("home")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <div className="nav-label">Home</div>
        </button>
        <button
          className={`nav-item ${bottomTab === "activity" ? "active" : ""}`}
          onClick={() => setBottomTab("activity")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <div className="nav-label">Activity</div>
        </button>
      </div>
    </div>
  )
}
