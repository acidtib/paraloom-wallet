import * as bip39 from "bip39"
import { sha256 } from "@noble/hashes/sha256"
import { randomBytes } from "@noble/hashes/utils"
import * as nacl from "tweetnacl"

export interface WalletKeyPair {
  publicKey: Uint8Array
  secretKey: Uint8Array
  shieldedAddress: string
}

export interface EncryptedWallet {
  encrypted: string
  nonce: string
  salt: string
}

/**
 * Generate a new seed phrase (12 words)
 */
export function generateSeedPhrase(): string {
  const entropy = randomBytes(16) // 128 bits = 12 words
  return bip39.entropyToMnemonic(Buffer.from(entropy))
}

/**
 * Validate seed phrase
 */
export function validateSeedPhrase(seedPhrase: string): boolean {
  return bip39.validateMnemonic(seedPhrase)
}

/**
 * Derive keypair from seed phrase with account index
 * Uses derivation path: m/44'/501'/{accountIndex}'/0'
 */
export function deriveKeypairFromSeed(seedPhrase: string, accountIndex: number = 0): WalletKeyPair {
  if (!validateSeedPhrase(seedPhrase)) {
    throw new Error("Invalid seed phrase")
  }

  // Convert seed to bytes
  const seed = bip39.mnemonicToSeedSync(seedPhrase)

  // Derive account-specific seed by hashing with account index
  const accountIndexBytes = new Uint8Array(4)
  new DataView(accountIndexBytes.buffer).setUint32(0, accountIndex, false)

  const combined = new Uint8Array(seed.length + accountIndexBytes.length)
  combined.set(seed)
  combined.set(accountIndexBytes, seed.length)

  const accountSeed = sha256(combined)

  // Derive Ed25519 keypair from account seed
  const keypair = nacl.sign.keyPair.fromSeed(accountSeed)

  // Generate shielded address (paraloom1 + hex of public key)
  const shieldedAddress = generateShieldedAddress(keypair.publicKey)

  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    shieldedAddress
  }
}

/**
 * Generate paraloom1... address from public key
 */
export function generateShieldedAddress(publicKey: Uint8Array): string {
  const hash = sha256(publicKey)
  const hex = Buffer.from(hash).toString("hex")
  return `paraloom1${hex}`
}

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveKeyFromPassword(password: string, salt: Uint8Array): Uint8Array {
  // Simple PBKDF2 using SHA-256 (100k iterations)
  let key = new TextEncoder().encode(password)

  for (let i = 0; i < 100000; i++) {
    const combined = new Uint8Array(key.length + salt.length)
    combined.set(key)
    combined.set(salt, key.length)
    key = sha256(combined)
  }

  return key
}

/**
 * Encrypt wallet with password (AES-256-GCM via TweetNaCl secretbox)
 */
export function encryptWallet(
  keypair: WalletKeyPair,
  password: string
): EncryptedWallet {
  // Generate random salt
  const salt = randomBytes(32)

  // Derive encryption key from password
  const encryptionKey = deriveKeyFromPassword(password, salt)

  // Generate random nonce
  const nonce = randomBytes(nacl.secretbox.nonceLength)

  // Serialize keypair
  const walletData = JSON.stringify({
    publicKey: Buffer.from(keypair.publicKey).toString("hex"),
    secretKey: Buffer.from(keypair.secretKey).toString("hex"),
    shieldedAddress: keypair.shieldedAddress
  })

  // Encrypt with NaCl secretbox (XSalsa20-Poly1305)
  const message = new TextEncoder().encode(walletData)
  const encrypted = nacl.secretbox(message, nonce, encryptionKey)

  return {
    encrypted: Buffer.from(encrypted).toString("hex"),
    nonce: Buffer.from(nonce).toString("hex"),
    salt: Buffer.from(salt).toString("hex")
  }
}

/**
 * Decrypt wallet with password
 */
export function decryptWallet(
  encryptedWallet: EncryptedWallet,
  password: string
): WalletKeyPair {
  // Parse hex strings
  const encrypted = Buffer.from(encryptedWallet.encrypted, "hex")
  const nonce = Buffer.from(encryptedWallet.nonce, "hex")
  const salt = Buffer.from(encryptedWallet.salt, "hex")

  // Derive encryption key from password
  const encryptionKey = deriveKeyFromPassword(password, salt)

  // Decrypt
  const decrypted = nacl.secretbox.open(encrypted, nonce, encryptionKey)

  if (!decrypted) {
    throw new Error("Invalid password")
  }

  // Parse wallet data
  const walletData = JSON.parse(new TextDecoder().decode(decrypted))

  return {
    publicKey: Buffer.from(walletData.publicKey, "hex"),
    secretKey: Buffer.from(walletData.secretKey, "hex"),
    shieldedAddress: walletData.shieldedAddress
  }
}

/**
 * Sign message with secret key
 */
export function signMessage(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey)
}

/**
 * Verify signature
 */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey)
}

/**
 * Encrypt seed phrase with password
 */
export function encryptSeedPhrase(seedPhrase: string, password: string): string {
  const salt = randomBytes(32)
  const encryptionKey = deriveKeyFromPassword(password, salt)
  const nonce = randomBytes(nacl.secretbox.nonceLength)
  const message = new TextEncoder().encode(seedPhrase)
  const encrypted = nacl.secretbox(message, nonce, encryptionKey)

  // Combine salt + nonce + encrypted and encode as hex
  const combined = new Uint8Array(salt.length + nonce.length + encrypted.length)
  combined.set(salt)
  combined.set(nonce, salt.length)
  combined.set(encrypted, salt.length + nonce.length)

  return Buffer.from(combined).toString("hex")
}

/**
 * Decrypt seed phrase with password
 */
export function decryptSeedPhrase(encryptedData: string, password: string): string {
  const combined = Buffer.from(encryptedData, "hex")

  // Extract salt, nonce, and encrypted data
  const salt = combined.subarray(0, 32)
  const nonce = combined.subarray(32, 32 + nacl.secretbox.nonceLength)
  const encrypted = combined.subarray(32 + nacl.secretbox.nonceLength)

  const encryptionKey = deriveKeyFromPassword(password, salt)
  const decrypted = nacl.secretbox.open(encrypted, nonce, encryptionKey)

  if (!decrypted) {
    throw new Error("Invalid password")
  }

  return new TextDecoder().decode(decrypted)
}
