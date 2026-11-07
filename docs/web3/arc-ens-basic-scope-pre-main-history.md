# Arc + ENS basic product slice

Owner decision, 6 November 2026. This supersedes the Arkiv/Swarm requirements in the older gate documents. Work stays on `web3/integrations`, delivered through draft [PR #4](https://github.com/hatif03/web3-multiplayer-games/pull/4), never merged into main.

## Scope

- Keep Arc and ENS. Retire production Arkiv writes/reads, Swarm uploads/keepers, their funding/acceptance gates and claims of decentralized record availability. Preserve historical G0 evidence and private journals.
- Keep the product flows: local durable results/replays, Hall, leaderboards, receipt ledger, Live hub, winner predictions, equal table cheers, challenges, creator publishing/passes/splits/claims/referrals.
- Build a basic flow and essential checks. Do not repeat the completed A4 public matrix or exhaustive fuzz/browser permutations. Amount conservation, signature identity, seated-player exclusion, refund defaults, pull claims and honest proof labels remain essential.
- Local records and exports replace Arkiv/Swarm storage. A separate machine needs an exported copy and the exact matching game build; there is no permissionless availability or permanence claim.
- `PARTNERS` enables only ENS and Arc by inheritance. `WEB3_ARKIV` defaults off. Markets and commerce require their own explicit mode; MOCK balances are local simulations, never Arc receipts.

## Parallel implementation lanes

| Lane | Current implementation | Acceptance still needed |
| --- | --- | --- |
| Local records / ledger | INTEGRATED / PASS-LOCAL: durable canonical rounds, local leaderboard, hash-chain receipt journal, two-host transaction confirmation and offline export/query/replay; phone/desktop Hall | Full historical indexing and external checkpoints are outside the basic slice. Public replay download waits until its table closes |
| Predictions / cheers | INTEGRATED / PASS-LOCAL: signed spectator session/bets, before-start window, seat exclusion, separate replay process/key, void/refunds, pull payouts and equal table cheers. Studio contracts and injected Arc lifecycle implemented | Live HTTP/worker provider/config activation and SplitPayout worker plumbing remain; owner deployment and public acceptance remain. `MARKETS=on` stays unavailable |
| Creator commerce | INTEGRATED / PASS-LOCAL: immutable first-party publication, frozen fees/splits/referrals, free demo/pass, earnings and claims. Host gate checks bound phone identities; expired demos abandon/refund. RevenueRouter artifact and injected live port implemented | Live HTTP/worker wiring, owner deployment and public pass/claim acceptance remain. `COMMERCE=on` stays unavailable |
| Live / challenges / handles | INTEGRATED / PASS-LOCAL: responsive Live page, OS window/host controls, signed challenge board/private accepted invites and earned local handle/recovery export. Real Champion adapter passes focused tests and a local fork | Public `players.funcaster.eth` is absent; parent needs renewal for full-year issuance. Adapter is not connected to product issuance yet. Legend/season depth is deferred |

## Important boundaries

Existing ConditionalPot deployment and A4 acceptance are complete. Do not redeploy or rerun those probes. Integrated public ENS + Arc gameplay remains unverified. New MatchMarkets / SplitPayout / RevenueRouter public deployment and signing remain owner-operated under the earlier automatic approval-review restriction. No new public deployment command is ready yet.

Guide 24 §4.3 supersedes the earlier per-game fee wording: the creator's first $1,000 of lifetime commerce revenue is fee-free; the counter is per creator across games and versions. Commerce income is separate from play-money stake payouts.

Physical phone motion/multitouch, hosting and platform-app registrations remain owner-deferred. G3–G5 depth is not part of this fast G1/G2 slice. Public live activation must not be reported complete because a local MOCK UI works.

## Verification and review handoff

- **874 repository tests pass**: 313 unit, 117 party, 168 OS, 276 Web3. Both partner-off parity gates stay green. Final log: [basic product check](evidence/basic-product/check.txt).
- Predictions: 11 focused Node checks, 71 Solidity checks, six actual localhost EVM lifecycle checks; spectator prediction/cheer/replay/claim browser flow passes.
- Commerce: nine Node checks, four Solidity acceptance checks and source/ABI/signature consistency; real Chromium publish → demo → pass → displayed split → earnings → claim → controller return passes.
- Champion: four focused checks and a guarded localhost Sepolia fork validate restricted namespace setup, phone-owned mint, unregister denial, renewal and transfer. Public keyless checks confirm the renewal/namespace prerequisites; no public write occurred. [Detailed handoff](../../integrations/ens/CHAMPION.md).
- Root integrated browser check: two real browser phone identities, host listing/open/start hold/close, private challenge offer and all four new pages at desktop/320px. [Report](evidence/basic-product/report.json), [desktop](evidence/basic-product/os-live.png), [phone](evidence/basic-product/live-320.png). Individual lane checks also cover 390px and landscape. Physical devices remain deferred.
- Commits: local records/ledger `c9bf676`, predictions/cheers/ports `75164d2`, creator slice `e048114`; final integration and evidence are in the same draft PR. Temporary local test servers/workers were stopped.

Run `npm run start:basic` from the repository. It starts the relay and MOCK worker together with isolated `.local/basic-demo` storage, enables the basic product pages and loads no private env files. Open `/?shell=os`, then **Start → Funcaster Live**. Phone settings link to Live; `/predict`, `/records/` and `/commerce/` are directly reachable. It uses self-signed HTTPS by default; hosted HTTPS remains pending.

**Next implementation:** connect the reviewed live market/cheer/commerce ports to their worker jobs and product HTTP flows, prepare exact capped deployment commands, then complete owner-operated public acceptance. This is still coding work as well as owner signing; deployment alone does not make these MOCK flows live. Champion activation additionally requires the verified namespace/renewal work. The basic local product is usable now; full public G1/G2 acceptance is not declared complete.
