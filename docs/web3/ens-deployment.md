# ENS deployment — E1 / E2

6 November 2026 (IST). **E1 discovery/preflight and E2 namespace bootstrap are complete.** E3/E4's party/seat engine and transaction port are now implemented and locally fork-tested (`3dc111d`); their worker/relay wiring and public acceptance remain pending. E5 live host authority and E6 records/history remain unimplemented. No public deployment occurred in either G1 milestone.

## Provenance and deployed namespace

Network: Ethereum Sepolia, chain 11155111. Protocol contracts are pinned to ENS contracts-v2 `07e55a056f5b6a9c90119f501bdd05714e67dddd`, ensjs **5.2.7**, viem **2.57.14**. [Protocol addresses and ABI provenance](../../integrations/ens/deployment-pin.json) are compared against the [official deployment page](https://docs.ens.domains/learn/deployments/) by the preflight.

| Resource | Address / value |
| --- | --- |
| Parent | `funcaster.eth` |
| Parent expiry | 1 November 2027, 15:57:12 IST (`1825064832`) |
| Registrar (public address only) | `0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5` |
| Parent UserRegistry proxy | `0x03dB3cdE1139CE7aBa50E6176ee28E1eBECC77CD` |
| `play.funcaster.eth` UserRegistry proxy | `0x15E729A01519A22a726D2C829285781a3DEEb0Cb` |
| `play.funcaster.eth` PermissionedResolver proxy | `0x8FB3Bc94532Ff13C75d84201D72E7A0A77Bf9439` |

These are evidence, not hard-coded party routing. The runtime discovers both child registries and the resolver by following root → ETHRegistry → `chonks` → `play` at one fresh block. It checks factory implementation provenance, canonical names, backlinks, ownership, expiry and registrar root/admin roles. It does not retain token IDs across role changes.

## Existing owner-executed receipts

The owner completed these on 6 November IST. [Full bootstrap report](spikes/ens-bootstrap-live.json) contains the exact initialization calldata, deterministic salts, grants and costs. [Independent verification](spikes/ens-bootstrap-verified.json) and the original [ENS evidence](ens-evidence.md) remain the receipt record.

| Operation | Block | Transaction |
| --- | --- | --- |
| Deploy parent registry | 12071988 | `0xf2c442bd4522b6139a386efd4fba5948e360f15010911661ad97d9992352432d` |
| Deploy play registry | 12071989 | `0x2b2a7627806c0d25061d5fcecae87bdb2b3d935bd1cff272536ba2b94b0766a0` |
| Deploy play resolver | 12071990 | `0x91ad45c75f42e82ed3acb744db76c6fdb01bfeba62baf0a4f0ada50c3d3112db` |
| Canonical parent link | 12071991 | `0xb000e6a85cd8729cb78698aae9c18e452e5856f5740a88d0644d0d7c924b4101` |
| Canonical play link | 12071992 | `0xf08f59d476650f945165cc15d0a1b6712d8daf3ad2d76c3b04b31ea5494d7537` |
| Attach parent subregistry | 12071993 | `0xdb81fe68c4868b7a048235f426f789feffea5fc8f148cedf91bc923b6a63966c` |
| Register play | 12071994 | `0x53d226e16601f4f6db1700411ca9110d1b15a9726662623eec64f580d7dd3fc4` |

The G0 address-record transaction makes `play.funcaster.eth` resolve to the project console (`0xE581E56c592Ab9D6d3D234168EE9a89032273c00`): `0x18a59daed07c0fd5e5e95a430252946f47c4001c28a6fc81fa4c3259dec22ffe`. Its evidence is in the [G0 completion](g0-completion.md). This is not a party or seat.

## Reproduce E1 without signing

```sh
npm run web3:install-ens
ENS_REGISTRAR_ADDRESS=0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5 \
ENS_RPC_URLS=https://ethereum-sepolia-rpc.publicnode.com \
node --env-file=.env.relay scripts/web3-ens-preflight.mjs
```

Only public configuration is read. `ENS_PARENT=funcaster.eth` already exists in the local relay config. Teammates can set it in their own public environment. Never load `.env.worker` for this command. Its public RPC transport refuses all signing, broadcasting and debug methods.

Latest result: **PASS**, Sepolia block **12074622**, 6 November 2026 11:22:46 IST. Six protocol addresses match the official page; the namespace and three registrar role checks pass. [Machine-readable report](spikes/g1-ens-preflight.json). This is one-host namespace verification, not a two-provider Ledger badge. The general preflight continues to refuse unimplemented live gameplay providers.

Tests: **27 new E1 tests**, **653 total repository tests**, partner-off parity and formatting pass. Evidence: [full check](g1-ens-check.txt), [formatting](g1-ens-format.txt). No UI was changed, so this chunk has no new browser-layout acceptance claim.

## E3/E4 engine and next integration

The engine now implements durable warm-pool reservations, restart reconciliation, party/seat collision handling, chain-time expiry, per-party resolver records, soulbound seats and release/end. **691 repository tests and 11 checks against the deployed contracts on a local Sepolia fork pass.** See [implementation, evidence and limitations](g1-ens-lifecycle.md). Warm opening needs three transactions; seat release clears resolver records because unregister alone can leave the old address resolvable.

Next: wire the engine into worker jobs, relay receipts, phone bindings and background refill, then finish E5/E6 and prepare a capped owner-run public flow. The current worker still refuses live activation. No further E2 bootstrap execution is needed; the local fork hashes are not additional public deployment receipts.
