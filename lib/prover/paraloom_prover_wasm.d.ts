/* tslint:disable */
/* eslint-disable */

/**
 * Poseidon commitment for a note `(amount, randomness, recipient)`, hex. The
 * wallet needs this to look up the note's Merkle path from the path server.
 */
export function note_commitment(amount: bigint, randomness_hex: string, recipient_hex: string): string;

/**
 * Spend-key note commitment (circuit v2, #293), hex.
 *
 * `commitment = Poseidon(amount, Poseidon(privkey), blinding, asset_id)`. Unlike
 * the v1 [`note_commitment`], the note binds the owner's spend *public key*
 * (derived from `privkey`) rather than a recipient address, and an `asset_id`
 * (the mint's 32 bytes; all-zero for native SOL). The wallet stores
 * `(privkey, blinding, asset_id)` and recomputes this on deposit.
 */
export function note_commitment_v2(amount: bigint, privkey_hex: string, blinding_hex: string, asset_id_hex: string): string;

/**
 * Build a v3 unified transact proof entirely in the browser.
 *
 * Fixed 2-in/2-out against the program's **on-chain** incremental tree:
 * `root_hex` must be a root from the program's root history (the wallet reads
 * it from the tree account or an event), and `ext_amount` is the signed
 * external flow — `< 0` withdraws `|ext_amount|` lamports to `recipient`,
 * `== 0` is a pure shielded transfer (`> 0` is rejected: deposits go through
 * `deposit_note`, no proof needed). The circuit enforces
 * `sum(inputs) + ext_amount == sum(outputs)`; `ext_data_hash` is derived here
 * exactly as the program derives it (SHA-256 over `recipient ‖ ext_amount`),
 * so the proof binds the payout destination. Spend keys never leave the
 * browser.
 *
 * Returns `{ nullifiers: [hex, hex], output_commitments: [hex, hex], proof }`
 * — with `root`/`ext_amount`/`recipient`, exactly the transact-ingress body.
 */
export function prove_transact(proving_key: Uint8Array, root_hex: string, ext_amount: bigint, recipient_hex: string, inputs_json: string, outputs_json: string): string;

/**
 * Build a shielded → shielded transfer proof entirely in the browser.
 *
 * Fixed 2-in/2-out, matching `TransferCircuit` and the ceremony key: both
 * `inputs` and `outputs` must contain exactly two entries. Every input must
 * be a real note in the tree (the circuit proves membership for each), so a
 * single-note spend is padded with a second real note rather than a dummy; an
 * unused output is a value-0 note. Input values must equal output values
 * (the circuit enforces conservation).
 *
 * - `proving_key`: the transfer ceremony proving key bytes (transfer_proving.key)
 * - `root_hex`: the inputs' membership root (the pool's current root), 32-byte hex
 * - `inputs_json`: JSON array of 2 [`TransferInput`]
 * - `outputs_json`: JSON array of 2 [`TransferOutput`]
 *
 * Returns `{ nullifiers: [hex, hex], output_commitments: [hex, hex], proof }`;
 * the wallet computes the post-state `new_merkle_root` and POSTs the lot to the
 * transfer ingress. The spend secrets never leave the browser.
 */
export function prove_transfer(proving_key: Uint8Array, root_hex: string, inputs_json: string, outputs_json: string): string;

/**
 * Build a shielded → shielded transfer proof with the spend-key construction
 * (circuit v2, #293), entirely in the browser.
 *
 * The successor to [`prove_transfer`]. Fixed 2-in/2-out. Each input is spent by
 * proving knowledge of its private key (folded into the nullifier through a
 * signature over `(commitment, leaf_index)`), and each output binds the
 * recipient's spend public key. All notes share one `asset_id` (all-zero for
 * native SOL); the circuit enforces value conservation and input-nullifier
 * distinctness.
 *
 * - `proving_key`: the v2 transfer ceremony proving key bytes
 * - `root_hex`: the inputs' membership root, 32-byte hex
 * - `asset_id_hex`: the shared asset id, 32-byte hex (all-zero = native SOL)
 * - `inputs_json`: JSON array of 2 [`TransferInputV2`]
 * - `outputs_json`: JSON array of 2 [`TransferOutputV2`]
 *
 * Returns `{ nullifiers, output_commitments, proof }` (hex), as [`prove_transfer`].
 */
export function prove_transfer_v2(proving_key: Uint8Array, root_hex: string, asset_id_hex: string, inputs_json: string, outputs_json: string): string;

/**
 * Build a withdrawal proof for a note the wallet owns.
 *
 * Inputs are hex/JSON so they cross the wasm boundary cleanly:
 * - `proving_key`: the ceremony proving key bytes (withdraw_proving_v4.key)
 * - `root_hex`, `recipient_hex`, `randomness_hex`, `secret_hex`: 32-byte hex
 * - `path_hex_json`: JSON array of 32-byte hex sibling hashes (root-less path)
 * - `indices_json`: JSON array of bools (sibling direction per level)
 *
 * `recipient_hex` is the note's recipient (the shielded address bound into the
 * commitment), not the on-chain withdrawal target. The proof's public inputs
 * are only `[root, nullifier, amount]`, so the destination Solana address is
 * chosen by the wallet when it assembles the ingress body.
 *
 * Returns `{ nullifier, proof }` (hex); the wallet adds the recipient, amount,
 * and fee before POSTing to the validator ingress.
 */
export function prove_withdrawal(proving_key: Uint8Array, root_hex: string, amount: bigint, randomness_hex: string, recipient_hex: string, secret_hex: string, path_hex_json: string, indices_json: string): string;

/**
 * Prove a spend-key withdrawal (circuit v2, #293).
 *
 * The successor to [`prove_withdrawal`]. Spend authority is the note's private
 * key, not a free secret: the commitment binds `Poseidon(privkey)` and the
 * nullifier folds in a signature over `(commitment, leaf_index)`, so only the
 * key-holder can spend and a note at a tree position yields exactly one
 * nullifier. The proof also commits to the withdrawal's `asset_id` (finding A)
 * and `ext_data_hash` (finding D), the latter derived here exactly as the
 * on-chain program does: `sha256(dest_recipient || amount.to_le_bytes())`. The
 * program recomputes both from the vault mint and the recipient it pays, so a
 * proof cannot be replayed against another asset or redirected.
 *
 * - `proving_key`: the v2 ceremony proving key bytes (withdraw_v2_proving.key)
 * - `privkey_hex`, `blinding_hex`, `asset_id_hex`: the note's spend key,
 *   blinding and asset id (32-byte hex; asset id all-zero for native SOL)
 * - `dest_recipient_hex`: the on-chain Solana destination the funds are paid to
 * - `path_hex_json` / `indices_json`: the root-less Merkle path and its
 *   direction bits, as [`prove_withdrawal`] takes them
 *
 * Returns `{ nullifier, proof }` (hex).
 */
export function prove_withdrawal_v2(proving_key: Uint8Array, root_hex: string, amount: bigint, blinding_hex: string, privkey_hex: string, asset_id_hex: string, dest_recipient_hex: string, path_hex_json: string, indices_json: string): string;

/**
 * Derive the spend public key from a spend private key (circuit v2, #293), hex.
 *
 * `pubkey = Poseidon(privkey)`, the value bound into a note's commitment. The
 * wallet derives its spend keypair from the account seed and publishes this
 * pubkey as part of its shielded address, so a sender can bind an output note
 * to it; only the holder of `privkey` can later spend that note.
 */
export function spend_pubkey(privkey_hex: string): string;

/**
 * Rebuild the v3 on-chain tree from its ordered leaf list and return the
 * membership path for `leaf_index` plus the current root.
 *
 * The wallet reconstructs the tree client-side from the program's public
 * `DepositNoteEvent`/`TransactEvent` logs instead of asking a validator for
 * its path — asking would leak which leaf is the wallet's. Hashing here (the
 * same circom Poseidon as the circuit and the on-chain syscall) keeps the
 * rebuild fast and bit-identical.
 *
 * `leaves_json`: JSON array of 32-byte hex leaf commitments in append order.
 * Returns `{ "path": [hex; 32], "root": hex }`.
 */
export function v3_merkle_path(leaves_json: string, leaf_index: number): string;

/**
 * Derive a v3 note commitment `Poseidon4(amount, pubkey, blinding, asset)`
 * for the native asset — the exact leaf `deposit_note` appends on-chain.
 */
export function v3_note_commitment(amount: bigint, pubkey_hex: string, blinding_hex: string): string;

/**
 * Derive the v3 spend public key `Poseidon1(privkey)` (circom Poseidon).
 */
export function v3_note_pubkey(privkey_hex: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly note_commitment: (a: bigint, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly prove_withdrawal: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => [number, number, number, number];
    readonly spend_pubkey: (a: number, b: number) => [number, number, number, number];
    readonly note_commitment_v2: (a: bigint, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly prove_withdrawal_v2: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => [number, number, number, number];
    readonly prove_transfer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly prove_transfer_v2: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly v3_note_pubkey: (a: number, b: number) => [number, number, number, number];
    readonly v3_note_commitment: (a: bigint, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly prove_transact: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number, number];
    readonly v3_merkle_path: (a: number, b: number, c: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
