// Paraloom bridge program on Solana. The same program the validator network
// indexes deposits from and settles withdrawals to (devnet, pre-mainnet).
export const PROGRAM_ID = "8gPsRSm1CAw38mfzc1bcLMUXyFN7LnS8k6CV5hPUTWrP"

// Anchor instruction discriminators (first 8 bytes of the instruction data),
// mirrored from the on-chain program / src/bridge/solana/instructions.rs.
export const DEPOSIT_DISCRIMINATOR = new Uint8Array([242, 35, 198, 137, 82, 225, 242, 182])

// Circuit v3 (#350): sha256("global:deposit_note")[..8] — the deposit that
// appends the note commitment to the on-chain incremental tree.
export const DEPOSIT_NOTE_DISCRIMINATOR = new Uint8Array([75, 212, 96, 185, 178, 167, 29, 57])
// sha256("event:DepositNoteEvent")[..8] / sha256("event:TransactEvent")[..8] —
// the program events the wallet scans to rebuild the v3 tree client-side.
export const DEPOSIT_NOTE_EVENT_DISCRIMINATOR = new Uint8Array([85, 20, 187, 76, 92, 196, 249, 195])
export const TRANSACT_EVENT_DISCRIMINATOR = new Uint8Array([89, 245, 87, 250, 222, 30, 135, 142])

// PDA seeds.
export const BRIDGE_STATE_SEED = "bridge_state"
export const BRIDGE_VAULT_SEED = "bridge_vault"
export const MERKLE_TREE_SEED = "merkle_tree"

// Public RPC endpoints. No API key is stored in the extension; the public
// devnet endpoint is enough for sending a deposit (a single transaction).
export const RPC_URLS: Record<"mainnet-beta" | "devnet", string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com"
}

export const LAMPORTS_PER_SOL = 1_000_000_000n

// Validator node endpoints, served over HTTPS by the public devnet node
// (Caddy reverse-proxies one host to the node's merkle / withdrawal / transfer
// services by path). One host; the path picks the service.
//   /merkle/path/:commitment   read-only Merkle path (withdrawal/transfer proofs)
//   /withdrawal/submit         withdrawal ingress
//   /transact/submit, /transact/scan   transact ingress + recipient discovery
export const PATH_SERVER_URL = "https://node.paraloom.io"
export const INGRESS_URL = "https://node.paraloom.io"
export const TRANSFER_INGRESS_URL = "https://node.paraloom.io"
export const TRANSACT_INGRESS_URL = "https://node.paraloom.io"
