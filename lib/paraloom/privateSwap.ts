// Private swap-out (#240): spend a shielded note, exit at a FRESH unlinkable
// address, then swap there on public liquidity (Jupiter). The on-chain trail
// never ties the swap back to the wallet that funded the deposit.
//
// Trust model — non-custodial. The fresh keypair is generated here, inside the
// user's wallet, and never leaves it: the withdraw funds the fresh address, the
// swap is signed locally with the fresh key, and the routing service only ever
// sees a public key. A privacy relayer that could sign could steal; this one
// cannot, and because the withdraw self-funds the fresh address the swap pays
// its own gas without the server holding anything.
//
// Availability: with `reshield` the swapped SPL token is re-shielded into a
// shielded note via deposit_note_spl (#779) — a true round trip (shielded SOL ->
// shielded token). Without it (or for a "SOL" output) the token is left at the
// fresh address as a private *buy*. Re-shielding is best-effort and fund-safe:
// the token is already persisted at the fresh address before it runs, so a
// failed re-shield simply leaves a private buy rather than stranding anything.

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction
} from "@solana/web3.js"

import { assetIdForMint } from "~lib/prover"

import { associatedTokenAddress, depositSpl } from "./bridge"
import { SWAP_ROUTER_URL } from "./constants"
import type { ShieldedNote } from "./notes"
import { saveSwapOutput } from "./swapOutputs"
import { spendV3 } from "./transactFlow"

/** Lamports left at the fresh address to cover the swap's own costs: the output
 *  token ATA rent (~0.00204), the fresh account's rent-exempt floor (~0.00089),
 *  and the swap tx + priority fees. The swap trades the funded balance minus
 *  this; 0.006 SOL is a comfortable margin. */
const SWAP_OVERHEAD_LAMPORTS = 6_000_000n

/** How long to wait for the 2-of-2 quorum to settle the withdraw before giving
 *  up (the note is safe either way — its change/spend is on-chain). */
const SETTLE_TIMEOUT_MS = 150_000
const SETTLE_POLL_MS = 3_000

export interface PrivateSwapParams {
  /** Output mint (base58) or the literal "SOL" for wrapped SOL. */
  outputMint: string
  /** Lamports of the input note(s) to spend on this private buy. */
  amountLamports: bigint
  /** Max slippage in bps (default 100 = 1%). */
  slippageBps?: number
  /** Re-shield the swapped token back into the shielded pool (a round trip),
   *  instead of leaving it at the fresh address (a private buy). Ignored for a
   *  "SOL" output. Best-effort: on failure the token stays at the fresh address. */
  reshield?: boolean
}

/** The shielded SPL note produced by a re-shield, so the caller can persist it
 *  against the wallet's account (privateSwap does not own note storage). */
export interface ReshieldedNote {
  assetId: string
  amount: string
  blindingHex: string
  depositSignature: string
}

export interface PrivateSwapResult {
  /** The unlinkable address now holding the swapped token. Shares no signer
   *  with the wallet that funded the deposit. */
  freshAddress: string
  /** Secret key of the fresh address (base58-free byte array), so the caller
   *  can persist it — the swapped token lives there. */
  freshSecretKey: Uint8Array
  /** Transact ingress request id for the withdraw leg. */
  withdrawRequestId: string
  /** Swap transaction signature. */
  swapSignature: string
  /** Output amount the route reported, in the out mint's base units. */
  outAmount: number
  /** Present when `reshield` was requested and succeeded: the shielded SPL note
   *  the caller should persist. Absent means the token stayed at the fresh
   *  address (a private buy) — either not requested or the re-shield failed. */
  reshielded?: ReshieldedNote
}

// Wait for the swap transaction to confirm by polling its signature status.
// Unlike connection.confirmTransaction (hard 30s deadline), this tolerates a
// busy mainnet: it only rejects on a real on-chain error or if the tx never
// confirms within the window.
async function waitForSwapConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 90_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const st = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true
    })
    const v = st.value
    if (v) {
      if (v.err) {
        throw new Error(`swap transaction failed on-chain: ${JSON.stringify(v.err)}`)
      }
      if (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized") {
        return
      }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(
    `swap submitted (${signature}) but not confirmed within ${timeoutMs / 1000}s — check the explorer`
  )
}

async function waitForFunding(
  connection: Connection,
  pubkey: Keypair["publicKey"]
): Promise<bigint> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SETTLE_POLL_MS))
    const bal = BigInt(await connection.getBalance(pubkey))
    if (bal > 0n) return bal
  }
  throw new Error(
    "withdraw did not settle within the timeout (the quorum may be slow; the note is unspent and can be retried)"
  )
}

/**
 * Run a private swap-out. Spends `inputs` (1–2 shielded notes) for
 * `params.amountLamports`, withdrawing to a fresh address, then swaps
 * SOL -> `params.outputMint` there.
 */
export async function privateSwap(
  connection: Connection,
  shieldedAddress: string,
  spendPrivkeyHex: string,
  ownBoxPubHex: string,
  inputs: ShieldedNote[],
  params: PrivateSwapParams,
  ingressToken?: string
): Promise<PrivateSwapResult> {
  if (params.amountLamports <= 0n) throw new Error("amount must be > 0")

  // 1. Fresh ephemeral key — generated here, never sent anywhere.
  const fresh = Keypair.generate()
  const freshHex = Buffer.from(fresh.publicKey.toBytes()).toString("hex")

  // Persist the fresh key up front, BEFORE the withdraw funds it. The withdrawn
  // SOL (and later the bought token) live at this address and are spendable only
  // with this key, so it must be saved before anything that can throw — a failed
  // route or a dropped worker must never strand the funds. The realized amount +
  // signature are filled in by an upsert once the swap lands.
  await saveSwapOutput({
    freshAddress: fresh.publicKey.toBase58(),
    freshSecretKeyHex: Buffer.from(fresh.secretKey).toString("hex"),
    outputMint: params.outputMint,
    outAmount: 0,
    swapSignature: "",
    createdAt: Date.now()
  })

  // 2. Withdraw the note value to the fresh address via the 2-of-2 quorum.
  const { requestId } = await spendV3(
    connection,
    shieldedAddress,
    spendPrivkeyHex,
    ownBoxPubHex,
    inputs,
    params.amountLamports,
    { kind: "withdraw", recipientSolanaHex: freshHex },
    ingressToken
  )

  // 3. Wait for settlement — the fresh address gets `amount - protocol fee`.
  const funded = await waitForFunding(connection, fresh.publicKey)

  // 4. Swap the funded balance minus the on-chain-cost reserve. Reading the
  //    real balance (not the requested amount) keeps the swap within what
  //    actually landed after the protocol withdrawal fee.
  const swapLamports = funded - SWAP_OVERHEAD_LAMPORTS
  if (swapLamports <= 0n) {
    throw new Error(
      `withdrawn ${Number(funded) / Number(LAMPORTS_PER_SOL)} SOL is below the swap overhead reserve`
    )
  }

  // 5. Ask the routing service to build an UNSIGNED swap tx for the fresh
  //    address (the service holds no key).
  const res = await fetch(`${SWAP_ROUTER_URL}/swap/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input_mint: "SOL",
      output_mint: params.outputMint,
      amount: Number(swapLamports),
      user_public_key: fresh.publicKey.toBase58()
    })
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`swap routing failed (${res.status}): ${body}`)
  }
  const { out_amount, swap_transaction } = (await res.json()) as {
    out_amount: number
    swap_transaction: string
  }

  // 6. Sign the swap with the fresh key locally and submit it.
  const tx = VersionedTransaction.deserialize(
    Uint8Array.from(Buffer.from(swap_transaction, "base64"))
  )
  tx.sign([fresh])
  const swapSignature = await connection.sendRawTransaction(tx.serialize(), {
    maxRetries: 5
  })

  // Persist the fresh key + output NOW, the instant the swap is submitted and
  // BEFORE waiting for confirmation. The bought token lives at this fresh
  // address and is only spendable with this key, so it must never be lost to a
  // later throw (a confirm timeout used to strand it). Saving here also makes it
  // show up under "Private buys" immediately.
  await saveSwapOutput({
    freshAddress: fresh.publicKey.toBase58(),
    freshSecretKeyHex: Buffer.from(fresh.secretKey).toString("hex"),
    outputMint: params.outputMint,
    outAmount: out_amount,
    swapSignature,
    createdAt: Date.now()
  })

  // Poll the signature status rather than connection.confirmTransaction, whose
  // 30s deadline throws "not confirmed in 30 seconds" on a busy mainnet even
  // when the swap actually lands. We wait up to ~90s and only fail on a real
  // on-chain error (or if it truly never confirms).
  await waitForSwapConfirmation(connection, swapSignature)

  // 7. Optional round trip: re-shield the swapped token back into the pool. The
  //    token is already safely at the fresh address (persisted above), so this
  //    is best-effort — any failure leaves a private buy rather than stranding
  //    funds. Skipped for a "SOL" output (re-shielding native SOL is pointless).
  let reshielded: ReshieldedNote | undefined
  if (params.reshield && params.outputMint !== "SOL") {
    try {
      const mint = new PublicKey(params.outputMint)
      const ata = associatedTokenAddress(fresh.publicKey, mint)
      // Re-shield the ACTUAL received balance, not the route's quote, so the
      // note matches what really landed after swap slippage.
      const bal = await connection.getTokenAccountBalance(ata)
      const tokenAmount = BigInt(bal.value.amount)
      if (tokenAmount > 0n) {
        const assetId = await assetIdForMint(
          Buffer.from(mint.toBytes()).toString("hex")
        )
        const dep = await depositSpl(
          connection,
          fresh,
          shieldedAddress,
          mint,
          tokenAmount,
          assetId
        )
        reshielded = {
          assetId,
          amount: tokenAmount.toString(),
          blindingHex: Buffer.from(dep.blinding).toString("hex"),
          depositSignature: dep.signature
        }
      }
    } catch {
      // Leave the token at the fresh address as a private buy; the caller sees
      // `reshielded` undefined and the swap output is already saved.
      reshielded = undefined
    }
  }

  return {
    freshAddress: fresh.publicKey.toBase58(),
    freshSecretKey: fresh.secretKey,
    withdrawRequestId: requestId,
    swapSignature,
    outAmount: out_amount,
    reshielded
  }
}
