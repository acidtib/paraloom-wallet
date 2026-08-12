/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const mint_to_asset: (a: number, b: number) => [number, number, number, number];
export const note_commitment: (a: bigint, b: number, c: number, d: number, e: number) => [number, number, number, number];
export const note_commitment_v2: (a: bigint, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
export const prove_transact: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number, number];
export const prove_transfer_v2: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
export const prove_withdrawal_v2: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => [number, number, number, number];
export const spend_pubkey: (a: number, b: number) => [number, number, number, number];
export const v3_merkle_path: (a: number, b: number, c: number) => [number, number, number, number];
export const v3_note_commitment: (a: bigint, b: number, c: number, d: number, e: number) => [number, number, number, number];
export const v3_note_commitment_asset: (a: bigint, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
export const v3_note_pubkey: (a: number, b: number) => [number, number, number, number];
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
