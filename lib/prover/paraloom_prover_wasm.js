/* @ts-self-types="./paraloom_prover_wasm.d.ts" */

/**
 * Poseidon commitment for a note `(amount, randomness, recipient)`, hex. The
 * wallet needs this to look up the note's Merkle path from the path server.
 * @param {bigint} amount
 * @param {string} randomness_hex
 * @param {string} recipient_hex
 * @returns {string}
 */
export function note_commitment(amount, randomness_hex, recipient_hex) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(randomness_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(recipient_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.note_commitment(amount, ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Spend-key note commitment (circuit v2, #293), hex.
 *
 * `commitment = Poseidon(amount, Poseidon(privkey), blinding, asset_id)`. Unlike
 * the v1 [`note_commitment`], the note binds the owner's spend *public key*
 * (derived from `privkey`) rather than a recipient address, and an `asset_id`
 * (the mint's 32 bytes; all-zero for native SOL). The wallet stores
 * `(privkey, blinding, asset_id)` and recomputes this on deposit.
 * @param {bigint} amount
 * @param {string} privkey_hex
 * @param {string} blinding_hex
 * @param {string} asset_id_hex
 * @returns {string}
 */
export function note_commitment_v2(amount, privkey_hex, blinding_hex, asset_id_hex) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(privkey_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(blinding_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(asset_id_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.note_commitment_v2(amount, ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

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
 * @param {Uint8Array} proving_key
 * @param {string} root_hex
 * @param {bigint} ext_amount
 * @param {string} recipient_hex
 * @param {string} inputs_json
 * @param {string} outputs_json
 * @returns {string}
 */
export function prove_transact(proving_key, root_hex, ext_amount, recipient_hex, inputs_json, outputs_json) {
    let deferred7_0;
    let deferred7_1;
    try {
        const ptr0 = passArray8ToWasm0(proving_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(root_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(recipient_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(inputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(outputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.prove_transact(ptr0, len0, ptr1, len1, ext_amount, ptr2, len2, ptr3, len3, ptr4, len4);
        var ptr6 = ret[0];
        var len6 = ret[1];
        if (ret[3]) {
            ptr6 = 0; len6 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred7_0 = ptr6;
        deferred7_1 = len6;
        return getStringFromWasm0(ptr6, len6);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

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
 * @param {Uint8Array} proving_key
 * @param {string} root_hex
 * @param {string} inputs_json
 * @param {string} outputs_json
 * @returns {string}
 */
export function prove_transfer(proving_key, root_hex, inputs_json, outputs_json) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passArray8ToWasm0(proving_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(root_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(inputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(outputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.prove_transfer(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var ptr5 = ret[0];
        var len5 = ret[1];
        if (ret[3]) {
            ptr5 = 0; len5 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred6_0 = ptr5;
        deferred6_1 = len5;
        return getStringFromWasm0(ptr5, len5);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

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
 * @param {Uint8Array} proving_key
 * @param {string} root_hex
 * @param {string} asset_id_hex
 * @param {string} inputs_json
 * @param {string} outputs_json
 * @returns {string}
 */
export function prove_transfer_v2(proving_key, root_hex, asset_id_hex, inputs_json, outputs_json) {
    let deferred7_0;
    let deferred7_1;
    try {
        const ptr0 = passArray8ToWasm0(proving_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(root_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(asset_id_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(inputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(outputs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.prove_transfer_v2(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        var ptr6 = ret[0];
        var len6 = ret[1];
        if (ret[3]) {
            ptr6 = 0; len6 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred7_0 = ptr6;
        deferred7_1 = len6;
        return getStringFromWasm0(ptr6, len6);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

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
 * @param {Uint8Array} proving_key
 * @param {string} root_hex
 * @param {bigint} amount
 * @param {string} randomness_hex
 * @param {string} recipient_hex
 * @param {string} secret_hex
 * @param {string} path_hex_json
 * @param {string} indices_json
 * @returns {string}
 */
export function prove_withdrawal(proving_key, root_hex, amount, randomness_hex, recipient_hex, secret_hex, path_hex_json, indices_json) {
    let deferred9_0;
    let deferred9_1;
    try {
        const ptr0 = passArray8ToWasm0(proving_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(root_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(randomness_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(recipient_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(secret_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(path_hex_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passStringToWasm0(indices_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len6 = WASM_VECTOR_LEN;
        const ret = wasm.prove_withdrawal(ptr0, len0, ptr1, len1, amount, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6);
        var ptr8 = ret[0];
        var len8 = ret[1];
        if (ret[3]) {
            ptr8 = 0; len8 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred9_0 = ptr8;
        deferred9_1 = len8;
        return getStringFromWasm0(ptr8, len8);
    } finally {
        wasm.__wbindgen_free(deferred9_0, deferred9_1, 1);
    }
}

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
 * @param {Uint8Array} proving_key
 * @param {string} root_hex
 * @param {bigint} amount
 * @param {string} blinding_hex
 * @param {string} privkey_hex
 * @param {string} asset_id_hex
 * @param {string} dest_recipient_hex
 * @param {string} path_hex_json
 * @param {string} indices_json
 * @returns {string}
 */
export function prove_withdrawal_v2(proving_key, root_hex, amount, blinding_hex, privkey_hex, asset_id_hex, dest_recipient_hex, path_hex_json, indices_json) {
    let deferred10_0;
    let deferred10_1;
    try {
        const ptr0 = passArray8ToWasm0(proving_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(root_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(blinding_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(privkey_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(asset_id_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(dest_recipient_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passStringToWasm0(path_hex_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passStringToWasm0(indices_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len7 = WASM_VECTOR_LEN;
        const ret = wasm.prove_withdrawal_v2(ptr0, len0, ptr1, len1, amount, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7);
        var ptr9 = ret[0];
        var len9 = ret[1];
        if (ret[3]) {
            ptr9 = 0; len9 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred10_0 = ptr9;
        deferred10_1 = len9;
        return getStringFromWasm0(ptr9, len9);
    } finally {
        wasm.__wbindgen_free(deferred10_0, deferred10_1, 1);
    }
}

/**
 * Derive the spend public key from a spend private key (circuit v2, #293), hex.
 *
 * `pubkey = Poseidon(privkey)`, the value bound into a note's commitment. The
 * wallet derives its spend keypair from the account seed and publishes this
 * pubkey as part of its shielded address, so a sender can bind an output note
 * to it; only the holder of `privkey` can later spend that note.
 * @param {string} privkey_hex
 * @returns {string}
 */
export function spend_pubkey(privkey_hex) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(privkey_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.spend_pubkey(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

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
 * @param {string} leaves_json
 * @param {number} leaf_index
 * @returns {string}
 */
export function v3_merkle_path(leaves_json, leaf_index) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(leaves_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.v3_merkle_path(ptr0, len0, leaf_index);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Derive a v3 note commitment `Poseidon4(amount, pubkey, blinding, asset)`
 * for the native asset — the exact leaf `deposit_note` appends on-chain.
 * @param {bigint} amount
 * @param {string} pubkey_hex
 * @param {string} blinding_hex
 * @returns {string}
 */
export function v3_note_commitment(amount, pubkey_hex, blinding_hex) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(pubkey_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(blinding_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.v3_note_commitment(amount, ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Derive the v3 spend public key `Poseidon1(privkey)` (circom Poseidon).
 * @param {string} privkey_hex
 * @returns {string}
 */
export function v3_note_pubkey(privkey_hex) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(privkey_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.v3_note_pubkey(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_is_function_754e9f305ff6029e: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_56732c2bc353f41d: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_c236cabd84a4d769: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_67b456be8673d3d7: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_9c758de292015997: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_length_4a591ecaa01354d9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_with_length_36a4998e27b014c5: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_3249fc62a0fafa30: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_static_accessor_GLOBAL_9d53f2689e622ca1: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_4c59f6c7ea29a144: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_e70ae9f2eb052253: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_4aa221f6a4f5ab22: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./paraloom_prover_wasm_bg.js": import0,
    };
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('paraloom_prover_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
