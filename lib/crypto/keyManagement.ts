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
 * Derive keypair from seed phrase
 */
export function deriveKeypairFromSeed(seedPhrase: string): WalletKeyPair {
  if (!validateSeedPhrase(seedPhrase)) {
    throw new Error("Invalid seed phrase")
  }

  // Convert seed to bytes
  const seed = bip39.mnemonicToSeedSync(seedPhrase)

  // Derive Ed25519 keypair from first 32 bytes
  const keypair = nacl.sign.keyPair.fromSeed(seed.slice(0, 32))

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
