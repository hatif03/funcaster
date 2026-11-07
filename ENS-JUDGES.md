# Funcaster × ENS — judge guide

**Documentation edition: 6 November 2026.**

Funcaster uses ENS for readable party names, phone-owned seats and scoped host authority. A player still joins by QR and uses their phone with XP-style touch pads and optional motion. ENS is connected to that authenticated room identity rather than used only as a decorative display name.

**Demo:** [Funcaster console](https://funcaster.onrender.com/?shell=os), [Live Hub](https://funcaster.onrender.com/live/), [Hall and receipt ledger](https://funcaster.onrender.com/records/). See the [Arc guide](ARC-JUDGES.md) for the separate test-token flows.

## Namespace and architecture

This uses the **pinned ENS contracts-v2 deployment on Ethereum Sepolia, chain 11155111**. `funcaster.eth` here is a testnet registration; it does not claim ownership of the mainnet name. The exact SDK, protocol addresses, source revision and artifact hashes are recorded in the [deployment pin](integrations/ens/deployment-pin.json).

```text
funcaster.eth
├── play.funcaster.eth
│   └── <table>.play.funcaster.eth
│       └── <seat>.<table>.play.funcaster.eth
└── players.funcaster.eth
    └── <earned-handle>.players.funcaster.eth
```

The phone retains its browser key and proves its address to the relay. The relay queues naming work in PostgreSQL; a separate worker owns the budgeted registrar signer. Fresh preflight checks canonical hierarchy links, implementations, ownership, expiry and roles. Pending jobs remain visibly pending; labels alone do not prove successful registration.

Temporary seats belong to the phone address and expire with the party. Releasing a seat also clears its resolver address; unregistering alone could leave stale resolver data. Designated host controls require the current phone binding and fresh scoped ENS authority. A brief connectivity or readiness change does not issue a new role grant; a real reassignment revokes the old grant. This is application-authorized delegation, not unrestricted control of the parent namespace.

## Public addresses and evidence

| Component                        | Sepolia explorer                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `funcaster.eth` parent registry  | [0x8d897aBC47Bba378121e32B7763C45217Db62036](https://sepolia.etherscan.io/address/0x8d897aBC47Bba378121e32B7763C45217Db62036) |
| `play.funcaster.eth` registry    | [0x41f8F285AC4E0461650797a434876c4F0DfD1205](https://sepolia.etherscan.io/address/0x41f8F285AC4E0461650797a434876c4F0DfD1205) |
| Play resolver                    | [0xAc6399138406AA2F09019E0c32641B5397D430EE](https://sepolia.etherscan.io/address/0xAc6399138406AA2F09019E0c32641B5397D430EE) |
| `players.funcaster.eth` registry | [0x57f7594d1d1A15B77b201D1891E2a312514eD7e8](https://sepolia.etherscan.io/address/0x57f7594d1d1A15B77b201D1891E2a312514eD7e8) |
| Registrar / parent owner         | [0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5](https://sepolia.etherscan.io/address/0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5) |

The [parent registration](https://sepolia.etherscan.io/tx/0xa50e5552509f0c109d4feb489bd3d8c98aa2aa207b0a2c2cd28a439b78e6a1dc) completed. Recorded expiry is Unix **1857069048**. Independent namespace reads verified `play` at block **12079008** and `players` at block **12079001**, including the restricted players-registry roles. This setup readback succeeded through one public RPC host while the second was unavailable: it is **not a two-host verification badge**. [Full setup evidence, canonical block hashes and four players-namespace transactions](docs/web3/funcaster-setup.md).

Hosted acceptance subsequently confirmed party and seat names and checked that both seat resolver records map to the retained phone addresses. For an example historical party registration, see [mellow-gecko-ve.play.funcaster.eth](https://sepolia.etherscan.io/tx/0xedb77d2788701f200a1ed5cb603ee153bd946b265ab352a98ae442caba84e497). That table has ended; it is a transaction reference, not a working join invitation. [Hosted evidence and recovery history](docs/web3/render-live.md).

## Earned Champion handles

The implemented Champion adapter accepts only a completed, replay-verified canonical result and a trusted participant address read from durable server records. The phone must explicitly acknowledge key recovery. A successful issuance gives it a one-year transferable name under `players.funcaster.eth`, a dedicated resolver and records linking the canonical result hash.

The restricted registry has no root unregister/admin or upgrade authority, and issuance removes registrar permissions from the dedicated resolver. Ancestor ownership and expiry still constrain reachability. This is not an unconditional, perpetual ownership guarantee. After a transfer, the new owner may select a resolver they control.

**Proven:** public namespace setup; hosted temporary party/seat names; local fork mint, renewal, transfer, unregister denial and restart reconciliation. **Still open:** a public phone-earned Champion claim and its independent final audit. Pending/local handles must not be presented as issued ENS names. Season/Legend issuance is outside this basic build. [Adapter and checks](integrations/ens/CHAMPION.md).

## Suggested demonstration and review

1. Show the ready namespace and a historical transaction before starting any new naming jobs.
2. After the operator clears remaining transaction allowances, create a table, scan its QR with two phones and show the transition from queued to actual party/seat names. Keep party codes as the fallback during RPC failure.
3. Compare the on-chain seat owner/address with the phone identity. Show designated host controls and their scoped authority, without claiming a pending grant is active.
4. Explain the earned-handle screen after a verified game as an implemented flow whose public claim remains to be accepted. Keep game replay verification, worker completion and independent receipt verification visibly distinct.

The last recorded allowance audit found **118 of 120 ENS admissions used**, before later cleanup. A further full table needs an explicit operator capacity review; do not reset journals or present that allowance as refreshed. Current readiness and the bounded next acceptance belong in [progress](docs/web3/progress.md).

Source entry points: [hierarchy/preflight](integrations/ens/hierarchy.mjs), [party/seat lifecycle](integrations/ens/lifecycle.mjs), [host integration](server/web3/ens-rooms.cjs), [Champion adapter](integrations/ens/champion.mjs), [name/history reads](integrations/ens/reads.mjs). Sensitive browser keys and signer journals are never required for judging.
