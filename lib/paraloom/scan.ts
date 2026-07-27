// Recipient discovery (#196): poll the node's /transfer/scan endpoint, trial-
// decrypt every delivered ciphertext with this wallet's box secret, and store
// the notes that decrypt as spendable. Failed decrypts are silent. Shielded
// balance then reflects received transfer notes, not just local deposits.

import { TRANSFER_INGRESS_URL } from "./constants"
import { tryDecryptNote } from "./noteCrypto"
import { addDiscoveredNote, getNotes } from "./notes"

interface DeliveredNote {
  output_commitment: string
  ciphertext: string
}

// Scan for and store notes owned by this wallet. Returns how many new notes
// were discovered. The note is spent later with the account's own spend key
// (#293), so no per-note secret is stored.
export async function scanForNotes(account: string, boxSecretKey: Uint8Array): Promise<number> {
  const res = await fetch(`${TRANSFER_INGRESS_URL}/transfer/scan`)
  if (!res.ok) {
    throw new Error(`Scan failed (${res.status})`)
  }
  const delivered = (await res.json()) as DeliveredNote[]

  const known = new Set(
    (await getNotes(account)).map((n) => n.commitment).filter(Boolean) as string[]
  )

  let found = 0
  for (const d of delivered) {
    if (known.has(d.output_commitment)) {
      continue
    }
    const note = tryDecryptNote(boxSecretKey, d.ciphertext)
    if (!note) {
      continue
    }
    await addDiscoveredNote(account, {
      amount: note.amount.toString(),
      blinding: note.blindingHex,
      assetId: note.assetIdHex,
      signature: "",
      createdAt: Date.now(),
      spent: false,
      commitment: d.output_commitment,
      source: "transfer"
    })
    found++
  }
  return found
}
