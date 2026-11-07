# Owner setup — current status (6 November 2026)

Both deployments are complete: worker/verifier `11fe204`, relay `cff34f0`. The ledger is available with its original history preserved and the creator registration/pass plus both predictions independently verified. Both spectators received their 0.05 test-USDC refunds, according to the public explorer; the fuller two-host refund audit remains partly RPC-rate-limited. The cheer never reached signing and the game did not start.

**No more commands for this recovery.** Keep every journal, all four profiles and all markers. Do not rerun the expired acceptance or any replacement flag. [Verified evidence and limitations](market-read-recovery.md).

**Next:** the agent must prepare a guarded new successful-game attempt and a reviewed owner-run ENS allowance update before asking for execution. The last permitted read at 6 November 00:57:19 UTC found 118/120 admissions; at most 2 remained before subsequent cleanup. No cap or spending total has changed. Preserve the original 0.05-SepETH gas ceiling and existing funds; this is not permission to reset old counters or create fresh funded wallets. Creator claim and full live cheer/game/payout checks remain outstanding.

1,018 repository tests and 13 focused ledger/replay tests pass; prior focused browser and real PostgreSQL checks pass. Both game CI jobs and security pass at `19b5451`. Draft [PR #5](https://github.com/hatif03/web3-multiplayer-games/pull/5) remains unmerged. Future activation/signing remains owner-operated under the earlier automatic approval-review restriction.

# Historical setup log (superseded by the current action above)


Latest (6 November): Render selected and CLI login renewed. Funcaster PostgreSQL provisioned; `funcaster.eth` registered on Sepolia for two years. Retain new ENS/Arc journals while deployment/namespace verification completes. Public signing and final hosted activation remain owner-operated under the earlier approval-review restriction. PR #4 merged with specific owner approval; new backend work has a separate PR. [Current deployment checklist](render-live.md). Older hosting/deferred notes below are historical.

Updated **6 November 2026 (IST)**. Work stays on `web3/integrations`; never merge into main. Keep keys, env files and tokens out of Git and chat.

**Scope update:** the owner now targets Arc + ENS only. No further Arkiv/Swarm funding, setup or production acceptance is required; those completed rows below are historical evidence. [Basic product scope](arc-ens-basic-scope.md). The new market/cheer/creator contracts will need a separate reviewed owner deployment later. Do not repeat completed A4 commands. Local product implementation can proceed without new owner information.

| Step | Status | Evidence / remaining action |
| --- | --- | --- |
| Arc Studio login + app (A1) | DONE | CLI 1.2.2 authenticated; [app](https://studio.arc.io/app/3e018243-4be8-4b94-a488-1f69c9401fae) created through Dia. Diagnostic exported/tested; later ConditionalPot deployment and A4 acceptance are complete. [Provenance](arc-ai-use.md) |
| Fresh keys by role | DONE locally; backup unverified | All 14 original keys are preserved. A fifteenth, separate EURC probe key was added locally in an ignored 0600 file; public inventory updated. Back up securely in your password manager. |
| ENS parent and bootstrap | DONE / independently verified | funcaster.eth on Sepolia expires 1 Nov 2027, 15:57:12 IST. Parent/play registries and play resolver/root roles now exist. [Evidence](ens-evidence.md). No further registration/bootstrap action needed. |
| Arc funding + first live probe | DONE for USDC and EURC | Both sponsored authorizations independently verified through two Arc RPC hosts. EURC signer retains 0.05 with zero native gas; relayer retains 19.95 EURC. No more G0 funding required. [Completion](g0-completion.md). |
| Arkiv network decision | DONE | Owner approved Rabdi 7794095 / exact SDK 1.0.1. [Migration](rabdi-migration.md) supersedes Tiramisu/0.8.1. |
| Arkiv console funding | DONE | Owner claimed 10 tGLM directly to console `0xE581E56c592Ab9D6d3D234168EE9a89032273c00`; public balance verified at block 263664. Faucet allows a different recipient after clicking “Use a different address.” |
| First Rabdi write probe | DONE / independently verified | Six successful transactions; eight remaining typed rows after the intended deletion; 24 predicate checks. Gas 0.00238213 tGLM, balance 9.99761787 tGLM. [Evidence](spikes/rabdi-owner-verified.json). No need to run the first probe again. |
| `.env.relay` / `.env.worker` | DONE locally in MOCK mode | Public Sepolia parent/network and Rabdi endpoints configured; keys isolated. Later contract addresses and hosted origin pending. |
| Arc A2/A4 public acceptance | DONE / independently verified | 12/12 scripted checkpoints, 54 canonical worker transactions, eight settled/refunded pots and zero outstanding claims agree on both RPC hosts. All original caps held. No further A4 signing/funding/deployment command needed. Preserve the journals. [Completion evidence](g1-arc-worker-public.md). |
| PR security-check triage | OPEN | Both game CI jobs pass. GitGuardian findings 39737262 / 39737263 point to the older public SHA-256 Studio export manifest, not A4 worker keys. Review the two findings in the connected GitGuardian workspace; no check was bypassed or ignored. [Evidence](g1-arc-worker.md#verification-and-reproduction). This is a review-status item, separate from runtime activation. |
| Final Rabdi probe | DONE / independently verified | 121 final canonical receipts, all 2,000 trusted scores plus forged/malformed fixtures, costs, atomicity and expiry checks verified. No more owner execution required. [Report](spikes/rabdi-final-verified.json). |
| EURC funding + probe | DONE / independently verified | Owner faucet and capped authorization completed. Two-host receipt verification passes; 0.00296636 test USDC gas, 0.05 EURC retained, zero native gas on the signer. |
| ENS address + cross-SDK write | DONE / independently verified | play.funcaster.eth resolves to the console. ENS record and same-process Arkiv write verified. One-hour fixture now expired; canonical calldata/creation proof and original live readback preserved. |
| Platform apps + YouTube audit (SL17) | DEFERRED / BLOCKED-HUMAN | Google/Twitch/Kick owner accounts, applicant/contact, Google project, HTTPS callback/privacy/deletion URLs, and owner submission. [Prepared checklist](operations/platform-apps.md). Not a blocker for current G1 coding. |
| HTTPS staging | DEFERRED / BLOCKED-HUMAN | Hosting account/domain/budget undecided; Vercel tentative. Persistent relay/worker/shared storage must be verified. [Notes](operations/staging.md). |

## Credential custody

**Next public prerequisites (not a request to repeat old setup):** the basic demo works locally now. Champion names require renewing the testnet parent beyond a full year and preparing the currently absent restricted `players.funcaster.eth` namespace; named read-only checks confirmed both prerequisites. [ENS instructions and unsigned preflight](../../integrations/ens/CHAMPION.md). New market/cheer/creator contracts still need final product wiring plus reviewed capped owner deployment commands; do not deploy arbitrary Studio outputs or rerun A4. No new public command is requested by this handoff.

Arc CLI: `.tools/arc-studio/node_modules/.bin/arc-studio`; credentials stay in the CLI. Nine worker roles are in `.env.worker`; verifier secrets only in `.env.verifier`; four spare/developer keys only in `.local/web3-keys/spares.env`; platform secrets belong only in `.env.gateway`. Private files are mode 0600, directory 0700, ignored by Git. One separate EURC probe key is in `.local/web3-keys/arc-eurc-probe.env`; no secret archive was created. Never upload these files to Studio or share them in chat.

ENS reveal/checkpoint and transaction journals remain in `.local/web3-keys/`; public reports contain receipts and addresses only. Do not delete a journal or rerun a transaction after an uncertain send. The agent can check its hash first. Earlier automatic approval review rejected agent broadcasts and requires the owner to execute signing; no alternate broadcast route is used.

## Free test funding

[Circle faucet](https://faucet.circle.com/) for Arc test USDC; [Sepolia PoW faucet](https://sepolia-faucet.pk910.de/) for SepETH; [official Rabdi faucet](https://hub.arkiv.network/faucet) for test GLM. The observed Rabdi page offered 10 tGLM per claim and a one-hour cooldown on 6 November; limits can change. No real funds were purchased. ENS registration used freely minted test MockUSDC on Sepolia.

## What comes next

G0 is complete with its recorded limits. **G1 ENS E3–E6 and Arc A2/A3/A4/A7 are implemented and locally verified.** A4 adds the complete worker lifecycle, drips, deadlines/recovery and keyless pot reads; **831 root tests** and 22 actual USDC/EURC worker-fork checks pass, including the exact-hash recovery reproduction. Prior contract/console evidence remains 177 Foundry tests, 219 console tests and 100 browser cases. Public deployment and A4 scripted worker acceptance are now independently verified on both RPC hosts. **A5/A6 phone/gameplay integration is now implemented and locally verified** (837 root tests and a two-phone Chromium game with MOCK payouts). **Next coding is Arkiv Tier 1/Swarm and Ledger/Memo.** Integrated public ENS/phone/console acceptance still needs an owner-operated live session later; no repeated A4 command is needed. [Gameplay handoff](g1-arc-gameplay.md). No new account or hosting decision blocks that coding. [Completed worker gate and next tasks](g1-arc-worker-public.md).

The local env files remain MOCK. Do not turn every partner on: ENS and Arc have separately gated adapters; Arkiv live mode still refuses startup. Arc requires `--confirm-arc-testnet`, verified deployment pins, explicit budgets and `ARC_MEMO=off` until N3/L2. The completed owner acceptance used **0.120785 test USDC gas** against its 0.55 cap, plus **0.12 test USDC + 0.12 test EURC** in drips; the separate deployment used 0.06359452 against its 0.1 gas ceiling. It does not change service env files. Keep its ignored private journals/fixture-seat keys; never send them in chat. Public worker execution and independent receipt readback are complete. No A4 owner action remains. Hosting, key backup, platform apps/audits and physical phones remain separate pending items.
