// Recipient discovery is the one place the wallet stores a note it did not
// create, from a payload a stranger can produce: the box public key that gates
// decryption is the public half of the shielded address, so anyone who knows an
// address can seal a ciphertext to it claiming any amount. #196 is the defence
// — recompute the commitment under OUR spend key and drop the note unless it
// matches the leaf it was delivered with.
//
// Every rejection path here is a silent `continue`, and that is correct: a
// stranger's note and a crafted note both have to look like "nothing for you".
// It also means a regression is silent — the balance is simply wrong, and
// #196's phantom notes were unspendable, so the wallet would brick on the next
// transfer with nothing pointing back at the scan.
//
// The prover is mocked because the wasm binary is a build input that is not in
// the repo. These tests therefore pin the control flow — that the commitment is
// recomputed, that it is recomputed under this wallet's own spend key, and that
// a mismatch drops the note — and not Poseidon itself. A test that the real
// hash is correct would need the prover artifacts.

import { encryptNote } from "~lib/paraloom/noteCrypto"
import { getNotes, markNoteSpentByIdentity, shieldedBalance } from "~lib/paraloom/notes"
import { scanForNotes } from "~lib/paraloom/scan"
import * as nacl from "tweetnacl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { installFakeChrome } from "./support/chromeStorage"

// Deterministic stand-in for the circuit hash. Depends on all three inputs, so
// a note whose amount or blinding does not match its commitment is a mismatch
// here for the same reason it would be under Poseidon.
const fakeCommitment = (amount: bigint, pubkeyHex: string, blindingHex: string) =>
  `c${amount.toString(16)}_${pubkeyHex.slice(0, 8)}_${blindingHex.slice(0, 8)}`

const v3NoteCommitment = vi.fn(async (amount: bigint, pubkeyHex: string, blindingHex: string) =>
  fakeCommitment(amount, pubkeyHex, blindingHex)
)
const v3NotePubkey = vi.fn(async (privkeyHex: string) => `pub_${privkeyHex}`)

vi.mock("~lib/prover", () => ({
  v3NoteCommitment: (a: bigint, p: string, b: string) => v3NoteCommitment(a, p, b),
  v3NotePubkey: (p: string) => v3NotePubkey(p),
  NATIVE_ASSET_HEX: "00".repeat(32)
}))

const ACCOUNT = "paraloom1" + "11".repeat(64)
const SPEND_PRIVKEY = "ab".repeat(32)
const OUR_SPEND_PUB = `pub_${SPEND_PRIVKEY}`
const BLINDING = "cc".repeat(32)
const ASSET = "00".repeat(32)

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex")

let ourBox: nacl.BoxKeyPair

/** A delivered note sealed to us, with a commitment that binds it correctly. */
function honest(amount: bigint, blindingHex = BLINDING) {
  return {
    output_commitment: fakeCommitment(amount, OUR_SPEND_PUB, blindingHex),
    ciphertext: encryptNote(hex(ourBox.publicKey), {
      amount,
      blindingHex,
      assetIdHex: ASSET
    })
  }
}

/**
 * The #196 attack: sealed to us so it decrypts, but the commitment does not
 * bind the decrypted values under our spend key. Storing it inflates the
 * balance with a note that can never be found in the on-chain tree.
 */
function phantom(claimedAmount: bigint) {
  return {
    output_commitment: "deadbeef_not_a_real_leaf",
    ciphertext: encryptNote(hex(ourBox.publicKey), {
      amount: claimedAmount,
      blindingHex: BLINDING,
      assetIdHex: ASSET
    })
  }
}

/**
 * A phantom note that also supplies the material to verify itself. The delivered
 * payload is entirely attacker-controlled, so no field in it may be used for
 * verification — only the wallet's own spend key. The extra keys below are
 * plausible names a hollowed-out implementation might reach for.
 */
function phantomWithSelfServedKey(claimedAmount: bigint) {
  const attackerPub = "pub_attacker"
  return {
    output_commitment: fakeCommitment(claimedAmount, attackerPub, BLINDING),
    spend_pubkey: attackerPub,
    pubkey: attackerPub,
    note_pubkey: attackerPub,
    ciphertext: encryptNote(hex(ourBox.publicKey), {
      amount: claimedAmount,
      blindingHex: BLINDING,
      assetIdHex: ASSET
    })
  }
}

/** Sealed to somebody else — the ordinary case, indistinguishable at the wire. */
function forSomeoneElse(amount: bigint) {
  const stranger = nacl.box.keyPair()
  return {
    output_commitment: fakeCommitment(amount, "pub_stranger", BLINDING),
    ciphertext: encryptNote(hex(stranger.publicKey), {
      amount,
      blindingHex: BLINDING,
      assetIdHex: ASSET
    })
  }
}

function respondWith(delivered: unknown[], ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    json: async () => delivered
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const scan = () => scanForNotes(ACCOUNT, ourBox.secretKey, SPEND_PRIVKEY)

beforeEach(() => {
  installFakeChrome()
  ourBox = nacl.box.keyPair()
  v3NoteCommitment.mockClear()
  v3NotePubkey.mockClear()
})

describe("phantom note rejection (#196)", () => {
  it("drops a note whose commitment does not bind the decrypted values", async () => {
    respondWith([phantom(1_000_000n)])
    expect(await scan()).toBe(0)
    expect(await getNotes(ACCOUNT)).toEqual([])
  })

  it("does not let a phantom note inflate the balance", async () => {
    // The number the user acts on, not just the flag — this is what #196
    // actually broke.
    respondWith([honest(100n), phantom(1_000_000n)])
    await scan()
    expect(await shieldedBalance(ACCOUNT)).toBe(100n)
  })

  it("recomputes the commitment under our own spend key", async () => {
    // The defence rests entirely on the pubkey being derived from OUR private
    // key rather than taken from the delivered payload. If that ever changes,
    // a crafted note verifies against itself and the check becomes decoration.
    respondWith([honest(100n)])
    await scan()

    expect(v3NotePubkey).toHaveBeenCalledWith(SPEND_PRIVKEY)
    // Named explicitly rather than looped over the recorded calls: a loop over
    // an empty call list passes, so it would go green on an implementation
    // that skipped the recomputation entirely.
    expect(v3NoteCommitment).toHaveBeenCalledOnce()
    expect(v3NoteCommitment).toHaveBeenCalledWith(100n, OUR_SPEND_PUB, BLINDING)
  })

  it("ignores verification material supplied by the delivered payload", async () => {
    // The behavioural form of the check above, and the one that survives a
    // refactor: a note that carries a commitment binding under a key it also
    // supplies must still be dropped. Asserting the call arguments alone
    // passes when the implementation falls back to our key for payloads that
    // happen not to carry one.
    respondWith([phantomWithSelfServedKey(1_000_000n)])
    expect(await scan()).toBe(0)
    expect(await shieldedBalance(ACCOUNT)).toBe(0n)
  })

  it("drops a note whose amount was altered after sealing", async () => {
    // Same commitment, different claimed amount: the recomputation moves and
    // the match fails. Pinned separately from the arbitrary-commitment case
    // because this is the version that looks well-formed.
    const good = honest(100n)
    respondWith([{ ...good, ciphertext: honest(999n).ciphertext }])
    expect(await scan()).toBe(0)
  })

  it("drops a note whose blinding was altered after sealing", async () => {
    const good = honest(100n)
    respondWith([{ ...good, ciphertext: honest(100n, "dd".repeat(32)).ciphertext }])
    expect(await scan()).toBe(0)
  })

  it("keeps scanning after a rejected note", async () => {
    // A `continue`, not a throw: one crafted note in the feed must not stop
    // the wallet from finding the real ones behind it. A griefer who can post
    // one ciphertext could otherwise suppress discovery entirely.
    respondWith([phantom(1n), honest(100n), phantom(2n), honest(200n)])
    expect(await scan()).toBe(2)
    expect(await shieldedBalance(ACCOUNT)).toBe(300n)
  })
})

describe("ordinary scanning", () => {
  it("stores a note that decrypts and verifies", async () => {
    respondWith([honest(4_200n)])
    expect(await scan()).toBe(1)

    const notes = await getNotes(ACCOUNT)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      amount: "4200",
      blinding: BLINDING,
      assetId: ASSET,
      spent: false,
      source: "transfer",
      commitment: fakeCommitment(4_200n, OUR_SPEND_PUB, BLINDING)
    })
  })

  it("ignores a note sealed to someone else without trying to verify it", async () => {
    respondWith([forSomeoneElse(500n)])
    expect(await scan()).toBe(0)
    // Cheap check first: a failed decrypt should not reach the circuit hash at
    // all, since the feed carries every recipient's notes.
    expect(v3NoteCommitment).not.toHaveBeenCalled()
  })

  it("is idempotent across rescans", async () => {
    respondWith([honest(100n)])
    expect(await scan()).toBe(1)
    expect(await scan()).toBe(0)
    expect(await getNotes(ACCOUNT)).toHaveLength(1)
  })

  it("does not resurrect a note that was already spent", async () => {
    // The ingress keeps delivering it after it is spent, so the known-set has
    // to cover spent notes too. Re-storing one puts spent money back in the
    // balance.
    respondWith([honest(100n)])
    await scan()
    await markNoteSpentByIdentity(ACCOUNT, (await getNotes(ACCOUNT))[0])

    expect(await scan()).toBe(0)
    expect(await getNotes(ACCOUNT)).toHaveLength(1)
    expect(await shieldedBalance(ACCOUNT)).toBe(0n)
  })

  it("counts a note delivered twice in one response only once", async () => {
    // `known` is a snapshot from before the loop, so without adding each
    // stored commitment to it a repeated delivery is stored once and counted
    // twice. The count is what the caller reports as "new notes found".
    const note = honest(100n)
    respondWith([note, note])

    expect(await scan()).toBe(1)
    expect(await getNotes(ACCOUNT)).toHaveLength(1)
  })

  it("counts only newly discovered notes", async () => {
    respondWith([honest(1n), honest(2n), honest(3n)])
    expect(await scan()).toBe(3)
    expect(await scan()).toBe(0)
  })

  it("throws when the ingress responds with an error", async () => {
    // Distinct from an empty feed: silently returning 0 would look like
    // "no notes for you" and hide an outage behind a plausible answer.
    respondWith([], false, 503)
    await expect(scan()).rejects.toThrow(/503/)
  })

  it("handles an empty feed", async () => {
    respondWith([])
    expect(await scan()).toBe(0)
  })
})
