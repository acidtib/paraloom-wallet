// Encrypted note delivery (#196), the wallet side of paraloom-core's
// `note_crypto`. A transfer's output note is encrypted to the recipient's
// shielded address (their X25519 box public key) so only they can discover and
// spend it. NaCl `box` (X25519 + XSalsa20-Poly1305) with a fresh ephemeral
// sender key per output — byte-compatible with core's `crypto_box` (pinned by
// core's tweetnacl interop test).
//
// Wire format (matches core's `EncryptedNote`):
//   bundle = epk(32) || nonce(24) || ct        (ct = tag(16) || ciphertext, NaCl)
//   NotePlaintext = amount(8, LE) || blinding(32) || assetId(32)  = 72 bytes (v2)

import { randomBytes } from "@noble/hashes/utils"
import * as nacl from "tweetnacl"

// Spend-key note plaintext (#293): the recipient recomputes the commitment with
// their OWN spend key, so the plaintext only needs the value, blinding and asset
// — no recipient field.
export interface NotePlaintext {
  amount: bigint
  blindingHex: string
  assetIdHex: string
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function encodePlaintext(note: NotePlaintext): Uint8Array {
  const pt = new Uint8Array(72)
  new DataView(pt.buffer).setBigUint64(0, note.amount, true) // amount, little-endian
  pt.set(hexToBytes(note.blindingHex), 8)
  pt.set(hexToBytes(note.assetIdHex), 40)
  return pt
}

/**
 * Encrypt `note` to `recipientBoxPubHex` (a 32-byte X25519 public key, i.e. the
 * recipient's shielded address bytes) under a fresh ephemeral key. Returns the
 * hex bundle to carry in the transfer's `ciphertexts`.
 */
export function encryptNote(recipientBoxPubHex: string, note: NotePlaintext): string {
  const recipientPub = hexToBytes(recipientBoxPubHex)
  const ephemeral = nacl.box.keyPair()
  const nonce = randomBytes(nacl.box.nonceLength) // 24
  const ct = nacl.box(encodePlaintext(note), nonce, recipientPub, ephemeral.secretKey)

  const bundle = new Uint8Array(32 + 24 + ct.length)
  bundle.set(ephemeral.publicKey, 0)
  bundle.set(nonce, 32)
  bundle.set(ct, 56)
  return bytesToHex(bundle)
}

/**
 * Try to decrypt a delivered ciphertext bundle with the wallet's box secret.
 * Returns the note on success, `null` otherwise (trial-decrypt: callers scan
 * every delivered note and silently skip the ones not for them).
 */
export function tryDecryptNote(boxSecretKey: Uint8Array, bundleHex: string): NotePlaintext | null {
  const bundle = hexToBytes(bundleHex)
  if (bundle.length < 56 + 16) {
    return null
  }
  const epk = bundle.slice(0, 32)
  const nonce = bundle.slice(32, 56)
  const ct = bundle.slice(56)

  const pt = nacl.box.open(ct, nonce, epk, boxSecretKey)
  if (!pt || pt.length !== 72) {
    return null
  }
  return {
    amount: new DataView(pt.buffer, pt.byteOffset, 72).getBigUint64(0, true),
    blindingHex: bytesToHex(pt.slice(8, 40)),
    assetIdHex: bytesToHex(pt.slice(40, 72))
  }
}
