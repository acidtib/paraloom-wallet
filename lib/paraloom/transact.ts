// Circuit v3 (#350): deposit_note + the unified transact spend.
//
// The v3 model replaces the leader-published root with the program's own
// on-chain incremental tree: `deposit_note` appends the commitment on-chain,
// and a spend proves membership against a root from the program's root
// history. The wallet rebuilds the tree CLIENT-SIDE from the program's public
// event logs — asking a validator for a path would leak which leaf is ours —
// and computes the membership path locally (`v3MerklePath`, the same circom
// Poseidon as the circuit and the on-chain syscall).

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  type Keypair
} from "@solana/web3.js"

import {
  BRIDGE_STATE_SEED,
  BRIDGE_VAULT_SEED,
  DEPOSIT_NOTE_DISCRIMINATOR,
  DEPOSIT_NOTE_EVENT_DISCRIMINATOR,
  MERKLE_TREE_SEED,
  PROGRAM_ID,
  TRANSACT_EVENT_DISCRIMINATOR,
  TRANSACT_INGRESS_URL
} from "./constants"

const programId = new PublicKey(PROGRAM_ID)

function pda(seed: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], programId)[0]
}

// Layout: DEPOSIT_NOTE discriminator (8) | amount u64 LE (8) | pubkey (32) |
// blinding (32) — matching the on-chain `deposit_note(amount, pubkey, blinding)`.
function depositNoteInstructionData(
  amountLamports: bigint,
  pubkey: Uint8Array,
  blinding: Uint8Array
): Buffer {
  const data = new Uint8Array(8 + 8 + 32 + 32)
  data.set(DEPOSIT_NOTE_DISCRIMINATOR, 0)
  new DataView(data.buffer).setBigUint64(8, amountLamports, true)
  data.set(pubkey, 16)
  data.set(blinding, 48)
  return Buffer.from(data)
}

export function depositNoteInstruction(
  depositor: PublicKey,
  amountLamports: bigint,
  pubkey: Uint8Array,
  blinding: Uint8Array
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: pda(BRIDGE_STATE_SEED), isSigner: false, isWritable: true },
      { pubkey: pda(BRIDGE_VAULT_SEED), isSigner: false, isWritable: true },
      { pubkey: pda(MERKLE_TREE_SEED), isSigner: false, isWritable: true },
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: depositNoteInstructionData(amountLamports, pubkey, blinding)
  })
}

/// Send a v3 deposit: moves lamports into the vault and appends the note
/// commitment to the on-chain tree. Returns the transaction signature; the
/// wallet learns its leaf index by scanning the DepositNoteEvent it emitted.
export async function sendDepositNote(
  connection: Connection,
  payer: Keypair,
  amountLamports: bigint,
  pubkey: Uint8Array,
  blinding: Uint8Array
): Promise<string> {
  const tx = new Transaction().add(
    depositNoteInstruction(payer.publicKey, amountLamports, pubkey, blinding)
  )
  return sendAndConfirmTransaction(connection, tx, [payer])
}

export interface V3Leaf {
  index: number
  commitmentHex: string
}

function eventPayloads(logs: string[]): Uint8Array[] {
  const out: Uint8Array[] = []
  for (const line of logs) {
    const m = line.match(/^Program data: (.+)$/)
    if (m) out.push(Uint8Array.from(Buffer.from(m[1], "base64")))
  }
  return out
}

function startsWith(buf: Uint8Array, prefix: Uint8Array): boolean {
  if (buf.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false
  return true
}

/// Rebuild the ordered v3 leaf list from the program's public event logs.
///
/// DepositNoteEvent: depositor(32) amount(8) commitment(32)@40 leaf_index(8)@72.
/// TransactEvent: nf0(32) nf1(32) oc0(32)@64 oc1(32)@96 new_root(32)
///   ext_amount(8) fee(8) recipient(32) ts(8) settlement_id(8) — the two
///   output commitments land at consecutive indices; the first one's index is
///   inferred from append order, so leaves are collected then sorted.
export async function fetchV3Leaves(connection: Connection): Promise<V3Leaf[]> {
  // Page through the FULL signature history, newest to oldest, following
  // `before`. `getSignaturesForAddress` caps each call at 1000, so a single
  // unpaginated fetch only ever saw the newest 1000 — once the program passed
  // 1000 transactions the wallet rebuilt a tree missing its oldest leaves,
  // producing a root the on-chain `is_known_root` rejects and freezing every
  // spend. Walk until a short page signals the end of history.
  const sigs: Awaited<ReturnType<typeof connection.getSignaturesForAddress>> = []
  let before: string | undefined
  for (;;) {
    const page = await connection.getSignaturesForAddress(programId, {
      limit: 1000,
      ...(before ? { before } : {})
    })
    if (page.length === 0) break
    sigs.push(...page)
    if (page.length < 1000) break
    before = page[page.length - 1].signature
  }

  const leaves: V3Leaf[] = []
  let transactLeafCursor: number | null = null

  // Oldest first so transact outputs are numbered in append order. Each page is
  // newest-first and pages go newest→oldest, so the full list is newest-first;
  // reversing yields true append order across the whole history.
  for (const sig of [...sigs].reverse()) {
    if (sig.err) continue
    const tx = await connection.getTransaction(sig.signature, {
      maxSupportedTransactionVersion: 0
    })
    const logs = tx?.meta?.logMessages ?? []
    for (const payload of eventPayloads(logs)) {
      if (startsWith(payload, DEPOSIT_NOTE_EVENT_DISCRIMINATOR)) {
        const body = payload.slice(8)
        const commitment = body.slice(40, 72)
        const leafIndex = Number(new DataView(body.buffer, body.byteOffset + 72, 8).getBigUint64(0, true))
        leaves.push({ index: leafIndex, commitmentHex: Buffer.from(commitment).toString("hex") })
        transactLeafCursor = Math.max(transactLeafCursor ?? 0, leafIndex + 1)
      } else if (startsWith(payload, TRANSACT_EVENT_DISCRIMINATOR)) {
        const body = payload.slice(8)
        const oc0 = body.slice(64, 96)
        const oc1 = body.slice(96, 128)
        const base = transactLeafCursor ?? leaves.length
        leaves.push({ index: base, commitmentHex: Buffer.from(oc0).toString("hex") })
        leaves.push({ index: base + 1, commitmentHex: Buffer.from(oc1).toString("hex") })
        transactLeafCursor = base + 2
      }
    }
  }
  leaves.sort((a, b) => a.index - b.index)
  return leaves
}

export interface TransactSpendInput {
  amount: bigint
  privkeyHex: string
  blindingHex: string
  leafIndex: number
  pathHex: string[]
}

export interface TransactOutputNote {
  amount: bigint
  pubkeyHex: string
  blindingHex: string
}

export interface TransactSubmission {
  requestId: string
}

/// POST a proven transact to the ingress. `proofBundleJson` is the exact JSON
/// `proveTransact` returns ({ nullifiers, output_commitments, proof }); the
/// wallet adds root / ext_amount / recipient / ciphertexts around it.
export async function submitTransact(
  rootHex: string,
  extAmount: bigint,
  recipientHex: string,
  proofBundleJson: string,
  ciphertexts: [string, string],
  ingressToken?: string
): Promise<TransactSubmission> {
  const bundle = JSON.parse(proofBundleJson)
  const body = {
    recipient: recipientHex,
    nullifiers: bundle.nullifiers,
    output_commitments: bundle.output_commitments,
    root: rootHex,
    ext_amount: Number(extAmount),
    proof: bundle.proof,
    ciphertexts
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (ingressToken) headers["Authorization"] = `Bearer ${ingressToken}`
  const res = await fetch(`${TRANSACT_INGRESS_URL}/transact/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`transact ingress rejected: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return { requestId: json.request_id ?? json.requestId }
}
