import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js"

import { addressSpendPubHex, type WalletKeyPair } from "~lib/crypto/keyManagement"
import { NATIVE_ASSET_HEX } from "~lib/prover"

import {
  ASSET_CONFIG_SEED,
  ASSET_VAULT_SEED,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  BRIDGE_STATE_SEED,
  BRIDGE_VAULT_SEED,
  DEPOSIT_DISCRIMINATOR,
  DEPOSIT_NOTE_SPL_DISCRIMINATOR,
  MERKLE_TREE_SEED,
  PROGRAM_ID,
  RPC_URLS,
  TOKEN_PROGRAM_ID
} from "./constants"

export type Network = "mainnet-beta" | "devnet"

export function getConnection(network: Network): Connection {
  return new Connection(RPC_URLS[network], "confirmed")
}

const programId = new PublicKey(PROGRAM_ID)

function bridgeStatePda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(BRIDGE_STATE_SEED)], programId)[0]
}

function bridgeVaultPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(BRIDGE_VAULT_SEED)], programId)[0]
}

// The 32-byte shielded-pool recipient carried by a `paraloom1<hex>` address.
export function shieldedAddressToBytes(shieldedAddress: string): Uint8Array {
  const hex = shieldedAddress.replace(/^paraloom1/, "")
  if (hex.length !== 64) {
    throw new Error("invalid shielded address")
  }
  return Uint8Array.from(Buffer.from(hex, "hex"))
}

// Layout: DEPOSIT discriminator (8) | amount u64 LE (8) | recipient (32) | randomness (32).
function depositInstructionData(
  amountLamports: bigint,
  recipient: Uint8Array,
  randomness: Uint8Array
): Buffer {
  const data = new Uint8Array(8 + 8 + 32 + 32)
  data.set(DEPOSIT_DISCRIMINATOR, 0)
  new DataView(data.buffer).setBigUint64(8, amountLamports, true)
  data.set(recipient, 16)
  data.set(randomness, 48)
  return Buffer.from(data)
}

export function buildDepositInstruction(
  depositor: PublicKey,
  amountLamports: bigint,
  recipient: Uint8Array,
  randomness: Uint8Array
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: bridgeStatePda(), isSigner: false, isWritable: true },
      { pubkey: bridgeVaultPda(), isSigner: false, isWritable: true },
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: depositInstructionData(amountLamports, recipient, randomness)
  })
}

export interface DepositResult {
  signature: string
  blinding: Uint8Array
  assetId: string // hex, 32 bytes (all-zero = native SOL)
  amount: bigint
}

// ---- SPL re-shield (#779) --------------------------------------------------

function merkleTreePda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(MERKLE_TREE_SEED)], programId)[0]
}

function assetVaultPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ASSET_VAULT_SEED), mint.toBytes()],
    programId
  )[0]
}

function assetConfigPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ASSET_CONFIG_SEED), mint.toBytes()],
    programId
  )[0]
}

// The associated token account of `owner` for `mint`, derived without
// @solana/spl-token (the extension bundles only web3.js): ATA =
// findProgramAddress([owner, tokenProgram, mint], associatedTokenProgram).
export function associatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = new PublicKey(TOKEN_PROGRAM_ID)
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), tokenProgram.toBytes(), mint.toBytes()],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
  )[0]
}

// Layout: DEPOSIT_NOTE_SPL discriminator (8) | amount u64 LE (8) | pubkey (32) |
// blinding (32) — identical arg shape to deposit_note, just the SPL variant.
function depositSplInstructionData(
  amount: bigint,
  pubkey: Uint8Array,
  blinding: Uint8Array
): Buffer {
  const data = new Uint8Array(8 + 8 + 32 + 32)
  data.set(DEPOSIT_NOTE_SPL_DISCRIMINATOR, 0)
  new DataView(data.buffer).setBigUint64(8, amount, true)
  data.set(pubkey, 16)
  data.set(blinding, 48)
  return Buffer.from(data)
}

// Build a `deposit_note_spl` instruction. Account order mirrors the on-chain
// DepositNoteSpl struct exactly: bridge_state, asset_config, mint, asset_vault,
// depositor_token_account, merkle_tree, depositor, token_program.
export function buildDepositSplInstruction(
  depositor: PublicKey,
  mint: PublicKey,
  depositorTokenAccount: PublicKey,
  amount: bigint,
  pubkey: Uint8Array,
  blinding: Uint8Array,
  tokenProgram: PublicKey = new PublicKey(TOKEN_PROGRAM_ID)
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: bridgeStatePda(), isSigner: false, isWritable: false },
      { pubkey: assetConfigPda(mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: assetVaultPda(mint), isSigner: false, isWritable: true },
      { pubkey: depositorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: merkleTreePda(), isSigner: false, isWritable: true },
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false }
    ],
    data: depositSplInstructionData(amount, pubkey, blinding)
  })
}

// Re-shield `amount` base units of `mint` held at `depositor`'s associated
// token account into the shielded pool, crediting `shieldedAddress`. `depositor`
// is the (fresh) keypair that owns the tokens (e.g. a private-swap output
// address). The blinding is returned so the caller can persist the note for a
// later SPL spend. `assetId` is `mint_to_asset(mint)`.
export async function depositSpl(
  connection: Connection,
  depositor: Keypair,
  shieldedAddress: string,
  mint: PublicKey,
  amount: bigint,
  assetId: string,
  tokenProgram: PublicKey = new PublicKey(TOKEN_PROGRAM_ID)
): Promise<DepositResult> {
  const recipient = hexToBytes(addressSpendPubHex(shieldedAddress))
  const blinding = new Uint8Array(32)
  crypto.getRandomValues(blinding)

  const ata = associatedTokenAddress(depositor.publicKey, mint, tokenProgram)
  const ix = buildDepositSplInstruction(
    depositor.publicKey,
    mint,
    ata,
    amount,
    recipient,
    blinding,
    tokenProgram
  )
  const tx = new Transaction().add(ix)
  const signature = await sendAndConfirmTransaction(connection, tx, [depositor], {
    commitment: "confirmed"
  })

  return { signature, blinding, assetId, amount }
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"))
}

// 32-byte form of a base58 Solana address — the withdrawal destination.
export function solanaAddressToBytes(address: string): Uint8Array {
  return new PublicKey(address).toBytes()
}

// Deposit `amountLamports` into the shielded pool, crediting the wallet's own
// shielded address. The randomness is returned so the caller can persist the
// note for a later withdrawal.
export async function deposit(
  connection: Connection,
  wallet: WalletKeyPair,
  amountLamports: bigint
): Promise<DepositResult> {
  const signer = Keypair.fromSecretKey(wallet.secretKey)
  // v2 (#293): the on-chain `recipient` field carries the spend public key the
  // commitment binds; `randomness` carries the note's blinding. The spend key
  // itself stays in the wallet (`wallet.spendPrivkey`).
  const recipient = hexToBytes(addressSpendPubHex(wallet.shieldedAddress))
  const blinding = new Uint8Array(32)
  crypto.getRandomValues(blinding)

  const ix = buildDepositInstruction(signer.publicKey, amountLamports, recipient, blinding)
  const tx = new Transaction().add(ix)
  const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed"
  })

  return { signature, blinding, assetId: NATIVE_ASSET_HEX, amount: amountLamports }
}

export async function getSolBalance(
  connection: Connection,
  publicKey: Uint8Array
): Promise<bigint> {
  const lamports = await connection.getBalance(new PublicKey(publicKey), "confirmed")
  return BigInt(lamports)
}

// Base58 Solana address for a raw ed25519 public key. This is the account that
// funds a deposit (distinct from the paraloom1… shielded address).
export function solanaAddress(publicKey: Uint8Array): string {
  return new PublicKey(publicKey).toBase58()
}
