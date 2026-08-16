// Private swap-out outputs. A private swap leaves the bought token at a FRESH,
// unlinkable address whose key the wallet generated. That key never leaves the
// wallet, so it must be persisted here or the token would be unrecoverable.
// Stored in extension-local storage (not synced).

export interface SwapOutput {
  /** The fresh, unlinkable address holding the swapped token. */
  freshAddress: string
  /** Secret key (hex) of the fresh address — needed to move the token later. */
  freshSecretKeyHex: string
  /** Output mint (base58) or "SOL". */
  outputMint: string
  /** Output amount the route reported, in the out mint's base units. */
  outAmount: number
  /** The swap transaction signature. Empty until the swap leg completes; a
   *  non-empty value marks the swap done (used to find resumable strands). */
  swapSignature: string
  /** Whether the user asked to re-shield the bought token (a round trip). Saved
   *  so a resumed/recovered swap honors the original intent. */
  reshield?: boolean
  createdAt: number
}

const KEY = "paraloom_swap_outputs"

// Upsert by freshAddress: the key is saved early (before the withdraw) so it can
// never be lost, then the same entry is updated with the realized amount +
// signature once the swap lands. Keyed on the address so the two writes collapse
// to one row.
export async function saveSwapOutput(output: SwapOutput): Promise<void> {
  const stored = await chrome.storage.local.get(KEY)
  const current = (stored[KEY] as SwapOutput[]) ?? []
  const i = current.findIndex((o) => o.freshAddress === output.freshAddress)
  if (i >= 0) current[i] = { ...current[i], ...output }
  else current.push(output)
  await chrome.storage.local.set({ [KEY]: current })
}

export async function listSwapOutputs(): Promise<SwapOutput[]> {
  const stored = await chrome.storage.local.get(KEY)
  return (stored[KEY] as SwapOutput[]) ?? []
}
