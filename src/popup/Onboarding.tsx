import { useState } from "react"
import {
  deriveKeypairFromSeed,
  encryptWallet,
  generateSeedPhrase,
  validateSeedPhrase
} from "~lib/crypto/keyManagement"
import { saveEncryptedWallet, setLockState } from "~lib/storage/secure"
import { useWalletStore } from "~lib/store/walletStore"

import logoImg from "data-base64:~/../paraloom.png"

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<"welcome" | "create" | "import">("welcome")
  const [createStep, setCreateStep] = useState<1 | 2>(1) // 1: seed, 2: password
  const [seedPhrase, setSeedPhrase] = useState("")
  const [seedRevealed, setSeedRevealed] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { unlock } = useWalletStore()

  function handleCreateWallet() {
    try {
      console.log("Creating new wallet...")
      const seed = generateSeedPhrase()
      console.log("Seed generated:", seed ? "success" : "failed")
      setSeedPhrase(seed)
      setStep("create")
    } catch (err) {
      console.error("Error creating wallet:", err)
      setError(err instanceof Error ? err.message : "Failed to generate seed phrase")
    }
  }

  async function handleSaveWallet() {
    setError("")
    console.log("Saving wallet...")

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (!validateSeedPhrase(seedPhrase)) {
      setError("Invalid seed phrase")
      return
    }

    setLoading(true)

    try {
      console.log("Deriving keypair...")
      const keypair = deriveKeypairFromSeed(seedPhrase)
      console.log("Encrypting wallet...")
      const encrypted = encryptWallet(keypair, password)
      console.log("Saving to storage...")
      await saveEncryptedWallet(encrypted, keypair.shieldedAddress)
      console.log("Unlocking wallet...")
      unlock(keypair)
      await setLockState(false)
      console.log("Wallet created successfully!")

      // Small delay to ensure state is updated before onComplete
      await new Promise(resolve => setTimeout(resolve, 100))
      onComplete()
    } catch (err) {
      console.error("Error saving wallet:", err)
      setError(err instanceof Error ? err.message : "Failed to create wallet")
    } finally {
      setLoading(false)
    }
  }

  async function handleImportWallet() {
    setError("")

    if (!validateSeedPhrase(seedPhrase)) {
      setError("Invalid seed phrase")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)

    try {
      const keypair = deriveKeypairFromSeed(seedPhrase)
      const encrypted = encryptWallet(keypair, password)
      await saveEncryptedWallet(encrypted, keypair.shieldedAddress)
      unlock(keypair)
      await setLockState(false)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import wallet")
    } finally {
      setLoading(false)
    }
  }

  if (step === "welcome") {
    return (
      <div className="container">
        <div className="header">
          <div className="logo-container">
            <div className="logo">paraloom</div>
            <img src={logoImg} alt="paraloom" className="logo-image" />
            <div className="subtitle">Privacy-focused wallet</div>
          </div>
        </div>

        <div className="card">
          <button className="button" onClick={handleCreateWallet}>
            Create New Wallet
          </button>
        </div>

        <div className="card">
          <button className="button button-secondary" onClick={() => setStep("import")}>
            Import Existing Wallet
          </button>
        </div>
      </div>
    )
  }

  if (step === "create") {
    const words = seedPhrase.split(" ")

    return (
      <div className="container compact">
        <div className="header">
          <div className="logo-container">
            <div className="logo">paraloom</div>
            <img src={logoImg} alt="paraloom" className="logo-image" />
            <div className="subtitle">Create Wallet</div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="step-indicator">
          <div className={`step-item ${createStep >= 1 ? 'active' : ''}`}></div>
          <div className={`step-item ${createStep >= 2 ? 'active' : ''}`}></div>
        </div>

        {createStep === 1 && (
          <>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', textAlign: 'center' }}>
              Write down these 12 words in order and keep them safe
            </div>

            <div className="card">
              <div className={`seed-grid ${!seedRevealed ? 'blurred' : ''}`}>
                {words.map((word, i) => (
                  <div key={i} className="seed-word">
                    {i + 1}. {word}
                  </div>
                ))}
              </div>

              {!seedRevealed && (
                <button
                  className="button button-secondary"
                  onClick={() => setSeedRevealed(true)}
                  style={{ marginTop: '12px' }}>
                  Click to Reveal Seed Phrase
                </button>
              )}
            </div>

            {seedRevealed && (
              <button className="button" onClick={() => setCreateStep(2)}>
                Continue to Password
              </button>
            )}
          </>
        )}

        {createStep === 2 && (
          <>
            {error && <div className="error">{error}</div>}

            <div className="card">
              <label className="label">Create Password</label>
              <input
                type="password"
                className="input"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />

              <label className="label">Confirm Password</label>
              <input
                type="password"
                className="input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <button className="button" onClick={handleSaveWallet} disabled={loading}>
                {loading ? "Creating..." : "Create Wallet"}
              </button>
            </div>

            <button
              className="button button-secondary"
              onClick={() => setCreateStep(1)}
              style={{ marginTop: '8px' }}>
              Back to Seed Phrase
            </button>
          </>
        )}
      </div>
    )
  }

  if (step === "import") {
    return (
      <div className="container">
        <div className="header">
          <div className="logo-container">
            <div className="logo">paraloom</div>
            <img src={logoImg} alt="paraloom" className="logo-image" />
            <div className="subtitle">Import Wallet</div>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
          Enter your 12-word recovery phrase
        </div>

        {error && <div className="error">{error}</div>}

        <div className="card">
          <label className="label">Seed Phrase</label>
          <input
            type="text"
            className="input"
            placeholder="word1 word2 word3 ..."
            value={seedPhrase}
            onChange={(e) => setSeedPhrase(e.target.value)}
          />

          <label className="label">Create Password</label>
          <input
            type="password"
            className="input"
            placeholder="Min 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label className="label">Confirm Password</label>
          <input
            type="password"
            className="input"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button className="button" onClick={handleImportWallet} disabled={loading}>
            {loading ? "Importing..." : "Import Wallet"}
          </button>
        </div>

        <div className="card">
          <button className="button button-secondary" onClick={() => setStep("welcome")}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return null
}
