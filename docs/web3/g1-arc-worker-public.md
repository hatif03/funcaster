# A4 public worker acceptance — complete

**Verified on 6 November 2026.** The owner completed all 12 scripted checkpoints. The independent keyless verifier confirms all 54 worker transactions and all eight final pot states through both configured Arc testnet RPC hosts. Every payout and refund claim is paid. This closes task **A4**, whose gate is the scripted testnet pot lifecycle; it does not close G1 gameplay, Ledger, phone or hosted acceptance.

No further A4 owner command, faucet, deployment or recovery is required. Preserve the ignored journals and fixture keys for reproducibility. Older retry instructions are historical.

## Evidence

- [Owner execution report](spikes/g1-arc-worker-public.json): 12 completed checkpoints, 54 unique worker hashes.
- [Independent two-host audit](spikes/g1-arc-worker-public-verified.json): exact transaction intent, sender, nonce, gas/fees, canonical receipt/block, method/asset restrictions, deployment code/domain, fixture terms, bankroll transfers and final pot states.
- [Audit output](g1-arc-public-audit.txt) and [four verifier guard tests](g1-arc-public-audit-guards.txt). Reproduce with `node scripts/web3-arc-verify-acceptance.mjs`, without an env file. It does not load keys, start a worker, sign, broadcast or edit private journals.
- Regression baseline: **831 root tests**, formatting and both game CI jobs pass at `115387d`; the recorded local-fork rehearsal covers **22 checks and 54 worker transactions**, including restart, recipient isolation and exact-hash recovery. No runtime code or UI changed in this completion chunk.

## Spending

| Item | Actual test amount | Original ceiling |
| --- | ---: | ---: |
| Relayer gas | 0.11218748 USDC | 0.5 USDC |
| Oracle gas | 0.00859752 USDC | 0.05 USDC |
| Worker gas total | 0.120785 USDC | 0.55 USDC |
| USDC bankroll drips | 0.12 USDC | 0.12 USDC |
| EURC bankroll drips | 0.12 EURC | 0.12 EURC |
| Separate contract deployment gas | 0.06359452 USDC | 0.1 USDC |

50 relayer transactions and four oracle proposals are confirmed, plus the separate deployment. Combined deployment and worker gas is **0.18437952 test USDC**, below the combined 0.65 ceiling. No real funds were used.

## Final states

| Scripted flow | State | Outstanding claim base units |
| --- | --- | --- |
| usdc cooperative | Settled | 0, 0 |
| usdc refund | Refunded | 0, 0 |
| usdc contest | Refunded | 0, 0 |
| usdc finalize | Settled | 0, 0 |
| eurc cooperative | Settled | 0, 0 |
| eurc refund | Refunded | 0, 0 |
| eurc contest | Refunded | 0, 0 |
| eurc finalize | Settled | 0, 0 |

The complete pot IDs, canonical block hashes and transaction hashes are in the independent audit. The final EURC claims are:

- `0xa95a631263f573a4c860eb70d67394ead41016c3d0287fd155092bc3e2f31ff3` — block 71028902, success, gas 0.00112126 test USDC.
- `0x9961aade2d12667b66a3b40ea4b5cf309b9a941ba1e3529437b86faa60b1cb3d` — block 71029002, success, gas 0.00102526 test USDC.

## Boundaries and next work

Results were synthetic canonical relay fixtures, not a real phone-played match. This is a reproducible integration audit, not a professional security audit or the future product Ledger badge. The contract was generated in the retained Arc Studio app; this gate uses its pinned reviewed artifact. All public signing was performed by the owner.

`PARTNERS=mock` remains in both service env files. Live stakes, phone funding and product Ledger verification are not enabled by this audit. Memo stays off for the A4 runner pending N3/L2. Physical-device and HTTPS staging acceptance remain pending.

**A5/A6 is now implemented and locally verified** through two browser phones and an actual game using MOCK chain effects; see [gameplay handoff](g1-arc-gameplay.md). **Next coding: Arkiv Tier 1/Swarm, then Ledger/Memo.** Integrated public ENS/phone/console acceptance and the G1 cross-partner match/failure drills remain open. No A4 owner command or deployment needs repeating.

Delivery remains review-only [PR #4](https://github.com/hatif03/web3-multiplayer-games/pull/4) on `web3/integrations`; nothing is merged into main. The two historical GitGuardian manifest findings remain open for external triage. No security check was bypassed.
