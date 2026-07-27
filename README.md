<h1 align="center">Paraloom Wallet</h1>

<p align="center">
  <strong>Browser wallet for the Paraloom shielded pool — proofs built in the extension, spend keys never leave it</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-informational" alt="MV3"/>
  <img src="https://img.shields.io/badge/network-devnet-yellow" alt="Devnet"/>
  <a href="https://github.com/paraloom-labs/paraloom-wallet/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"/></a>
</p>

<p align="center">
  <a href="https://github.com/paraloom-labs/paraloom-core">paraloom-core</a> •
  <a href="https://github.com/paraloom-labs/paraloom-prover-wasm">prover</a> •
  <a href="https://docs.paraloom.io">Documentation</a>
</p>

---

## What it does

Deposit into the shielded pool, hold notes, and spend them — withdrawing to a
Solana address or moving value inside the pool — with the zero-knowledge proof
built here rather than by a server.

That is the part worth caring about. A wallet that hands its secrets to
something else to have a proof made for it is not private, whatever the pool
does afterwards. The spend key stays in the extension; only a proof leaves.

## How the pieces fit

| | |
|---|---|
| [`paraloom-core`](https://github.com/paraloom-labs/paraloom-core) | the L2, the on-chain program, the circuits |
| [`paraloom-prover-wasm`](https://github.com/paraloom-labs/paraloom-prover-wasm) | those same circuits compiled to wasm |
| this repo | keys, notes, the flows, the UI |

Circuit v3 makes deposit, withdrawal and shielded transfer a single proof,
separated only by a signed external amount. A partial spend returns change as a
new note rather than losing it.

Received notes are found by trial-decrypting every ciphertext the node delivers
against this wallet's box key. Failures are silent — nothing tells a server
which notes are yours.

## Keys

One seed, three derivations, so nothing extra has to be backed up:

- **ed25519** — the Solana account
- **X25519** — opens note ciphertexts sealed to this wallet
- **spend key** — note commitments bind it and nullifiers sign under it, so only
  the holder can spend

The shielded address is `paraloom1<boxPub><spendPub>`, both hex.

## Build

```bash
pnpm install
pnpm dev            # development
pnpm build          # → build/chrome-mv3-prod
pnpm package        # → build/paraloom-wallet.zip
```

The prover's wasm and proving keys are **not** in this repo. They are build
inputs, copied into `lib/prover/` from a
[paraloom-prover-wasm](https://github.com/paraloom-labs/paraloom-prover-wasm)
build. Carrying them here would mean shipping whichever copy happened to be
committed, and a release once went out with the wrong key that way.

`pnpm build` runs `scripts/patch-manifest.mjs`, which re-adds the MAIN-world
content script entry Plasmo builds but omits from the manifest. Without it the
page-side provider is never injected and no site can see the wallet.

## Provider API

Injected as `window.paraloom` in the page's own world, bridged to the extension
through an isolated-world relay.

```typescript
connect()             => Promise<{ address, publicKey }>
disconnect()          => Promise<void>
isConnected()         => Promise<boolean>
getAddress()          => Promise<string | null>
getPublicAddress()    => Promise<string | null>
getShieldedBalance()  => Promise<string>
signMessage(msg)      => Promise<string>
sendPrivateTransfer({ recipient, amount, memo }) => Promise<string>
```

A site gets nothing until the user approves it, and disconnecting revokes
immediately rather than at the next reload.

## Security

The vault is encrypted under scrypt-derived keys. Wallets created before that
change still unlock and are re-encrypted on first open — no reset, no re-entered
seed.

An unlocked wallet lives in `chrome.storage.session`, which the browser never
writes to disk and clears on close. Auto-lock runs on an inactivity timer.

**Pre-mainnet.** Devnet only, and the proving keys are still pre-ceremony. The
[paraloom-core README](https://github.com/paraloom-labs/paraloom-core) carries
the honest list of what is not yet guaranteed. This wallet is in scope for the
[bug bounty](https://github.com/paraloom-labs/paraloom-core/blob/main/docs/bug-bounty.md).

## License

MIT.
