// Pure classification for the swap reconciler, split out so it carries no heavy
// imports (prover / wasm) and can be unit-tested in isolation. See
// swapReconcile.ts for how each verdict is acted on.

// A swap younger than this may still be in flight; do not touch it. Matches the
// page-side swap timeout budget with headroom.
export const RESUME_GRACE_MS = 120_000
// Below this the fresh address never received the withdraw (only rent dust), so
// the input note is still unspent and safe in the pool. Mirrors the swap
// overhead reserve in privateSwap.
export const RESUME_MIN_LAMPORTS = 6_000_000n

export type StrandAction = "skip" | "resume" | "landed" | "unresolved"

/// Decide what to do with a stranded swap row from its on-chain footprint.
///  - skip:       already recorded, or still inside the in-flight grace window.
///  - resume:     the fresh address holds swappable SOL → finish the swap leg.
///  - landed:     SOL is gone but the bought token sits there → record it done.
///  - unresolved: nothing recoverable → leave for the user to dismiss manually.
export function classifyStrand(args: {
  hasSignature: boolean
  ageMs: number
  solLamports: bigint
  tokenAmount: bigint
}): StrandAction {
  if (args.hasSignature) return "skip"
  if (args.ageMs < RESUME_GRACE_MS) return "skip"
  if (args.solLamports > RESUME_MIN_LAMPORTS) return "resume"
  if (args.tokenAmount > 0n) return "landed"
  return "unresolved"
}
