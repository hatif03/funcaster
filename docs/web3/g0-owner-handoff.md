# G0 owner handoff — 6 November 2026

All work stays on `web3/integrations`; never merge into main. Prior automatic approval review rejected agent signing/broadcast and requires the owner to execute public-chain transactions. The agent prepares/tests scripts and verifies public receipts; no alternate broadcast route is used.

## Completed — do not repeat setup

| Setup / probe | Verified result | Evidence |
| --- | --- | --- |
| ENS parent/play bootstrap | Seven owner-run receipts independently checked through PublicNode and thirdweb; canonical links, pinned implementations and root roles pass; current plan has zero writes | spikes/ens-bootstrap-live.json, ens-bootstrap-verified.json |
| Arc USDC authorization | Two receipts checked through both official RPC hosts, exact token-emitter transfers and retained 0.05 balance; total gas 0.00322892 test USDC | spikes/arc-owner-live.json, arc-owner-verified.json |
| Arc Studio app | Created in Dia, exported/cleaned; 56 tests + typecheck/build; 16 browser layout/error cases. No contract deployment | arc-ai-use.md |
| Rabdi faucet | Owner connected wallet, used “Use a different address,” claimed 10 tGLM to the project console | spikes/rabdi-owner-plan.json |
| Rabdi phase one | Six receipts, eight surviving fully typed rows, expected deletion, ownership/permissions and 24 typed queries independently verified. Gas 0.00238213 tGLM; balance 9.99761787 | spikes/rabdi-owner-live.json, rabdi-owner-verified.json |

Commands retained for read-only reproduction:

```sh
cd /Users/raihankhan/Documents/Projects/web3-multiplayer-games
ENS_BOOTSTRAP_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com node scripts/spikes/ens-bootstrap.mjs --check
node scripts/spikes/arc-verify-owner.mjs
node scripts/spikes/rabdi/check.mjs
node scripts/spikes/rabdi/verify.mjs
```

Rabdi synthetic fixtures use one-hour leases (the transferred example was extended by 300 blocks). A later missing fixture may be natural expiry; saved receipt evidence remains. Do not delete the journal or create replacements to conceal expiry.

## Remaining G0 work

The final probe, verifier and combined owner command are now prepared and tested. Continue with [g0-final-handoff.md](g0-final-handoff.md), which supersedes the earlier phase-two preparation note. No outstanding action is needed for the completed first probe.

Full SDK cross-write and worker/Hall builds, EURC live behavior, Memo receipt/per-product floor tests and remaining Swarm observations/fallbacks are still open. These are not waived by the first successful transactions. G1 starts after G0 is recorded.

## Operating safeguards

The ENS operator caps gas at 0.02 SepETH; Arc first probe caps token plus gas spend at 0.2 test USDC; Rabdi phase one caps aggregate gas at 0.5 tGLM. Each defaults to public reads, requires an exact `--apply` confirmation, checks its network, locks its signer and journals the signed hash before sending. Unknown/reverted receipts stop. A process killed abruptly may leave a lock: confirm the process is stopped and reconcile the journal before removing only that lock. Never blindly resend.

Fourteen existing role keys were validated, matched to public addresses and preserved in ignored 0600 files. No secret archive was made; password-manager backup remains owner work. Do not paste/upload keys, env files, reveal secrets or private journals. Accounts/platform audits and HTTPS staging remain owner-deferred, not blockers for writing the next probe.
