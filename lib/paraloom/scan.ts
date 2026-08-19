// Recipient discovery (#196): poll the node's /transact/scan endpoint, trial-
// decrypt every delivered ciphertext with this wallet's box secret, and store
// the notes that decrypt as spendable. Failed decrypts are silent. Shielded
// balance then reflects received transfer notes, not just local deposits.

import { TRANSACT_INGRESS_URL } from "./constants"
import { tryDecryptNote } from "./noteCrypto"
import { addDiscoveredNote, getNotes } from "./notes"
import { v3NoteCommitment, v3NotePubkey } from "~lib/prover"

interface DeliveredNote {
  output_commitment: string
  ciphertext: string
}

// Scan for and store notes owned by this wallet. Returns how many new notes
// were discovered. The note is spent later with the account's own spend key
// (#293), so no per-note secret is stored.
//
// `spendPrivkeyHex` is required to VERIFY each delivered note, not to spend it.
// The box public key that gates decryption is the public half of the shielded
// address, so anyone who knows a victim's address can seal a ciphertext to
// them claiming any amount. Trusting the server-supplied `output_commitment`
// after a successful decrypt let a griefer inject a phantom note whose stored
// commitment does not bind the decrypted (amount, blinding) under the victim's
// spend key: it inflated the balance and, because it can never be found in the
// on-chain tree, bricked every subsequent transfer. We now recompute the
// commitment ourselves and store the note only if it matches.
export async function scanForNotes(
  account: string,
  boxSecretKey: Uint8Array,
  spendPrivkeyHex: string
): Promise<number> {
  const res = await fetch(`${TRANSACT_INGRESS_URL}/transact/scan`)
  if (!res.ok) {
    throw new Error(`Scan failed (${res.status})`)
  }
  const delivered = (await res.json()) as DeliveredNote[]

  const known = new Set(
    (await getNotes(account)).map((n) => n.commitment).filter(Boolean) as string[]
  )
  const spendPubHex = await v3NotePubkey(spendPrivkeyHex)

  let found = 0
  for (const d of delivered) {
    if (known.has(d.output_commitment)) {
      continue
    }
    const note = tryDecryptNote(boxSecretKey, d.ciphertext)
    if (!note) {
      continue
    }
    // The commitment must bind the decrypted amount and blinding under OUR
    // spend key and equal the on-chain output commitment. A mismatch means the
    // ciphertext does not describe the leaf it was delivered with — a crafted
    // or corrupt note — so drop it rather than store an unspendable phantom.
    const expected = await v3NoteCommitment(note.amount, spendPubHex, note.blindingHex)
    if (expected !== d.output_commitment) {
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
    // Track it here too: the same commitment can appear twice in one response,
    // and `known` is otherwise only a snapshot from before the loop, so the
    // note would be stored once but counted twice.
    known.add(d.output_commitment)
    found++
  }
  return found
}
