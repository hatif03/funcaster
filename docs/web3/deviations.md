# Web3 deviations and open decisions

## 6 November: owner-approved Arc + ENS basic slice

- “Archive” is interpreted as Arkiv: the owner explicitly targets Arc + ENS and drops Arkiv/Swarm Web3 work. This overrides older K/Swarm production gates. Existing G0 evidence stays historical; local durable storage/exports replace decentralized availability claims.
- Parallel implementation and focused basic checks are authorized. [Current scope and acceptance boundaries](arc-ens-basic-scope.md). Public signing remains owner-operated, live modes stay off, and completed A4 acceptance is not repeated.
- Persistent earned ENS names require namespace/role work not covered by the existing party/seat registrar. The basic UI may save a local earned handle with a recovery export, but must not call it an issued Champion/Legend ENS name.
- Guide 24 §4.3/CP15 explicitly uses a per-creator lifetime fee-free counter and supersedes earlier per-game wording. The commerce slice follows the later specification.

2026-11-06:

- The owner explicitly authorizes autonomous safe setup, overriding guide 26's blanket human-only designation for local key generation and env preparation. Login/2FA/CAPTCHA, paid activity and legal declarations still need the owner; no account or budget has been supplied.
- `plan.md` predates the Oct 27 branch exception. The new handoff and AGENTS exception govern Web3: only `web3/integrations`, no main merge.
- Guide 08 says MARKETS defaults off and also inherits PARTNERS. Use the conservative explicit default **off**; enabling partners does not enable wagers.
- Guide 08 lists MARKET_VERIFIER_KEY beneath worker variables but expressly excludes it from the main worker. It belongs only in `.env.verifier`.
- The owner mentioned Vercel tentatively, with no account/domain/budget finalized. Do not deploy or assume persistent relay/worker/shared-volume support. Assess the actual runtime against guide 08 before choosing staging.
- ENS candidate: `funcaster.eth` on the specified testnet, then `chonksplay.eth` if unavailable. Both were available in the 6 November read-only check at Sepolia block 12039964. The owner subsequently registered funcaster.eth; independent ownership/expiry/role verification is in ens-evidence.md. No mainnet purchase.
- Current date is 6 November. Production Arkiv work remains date-gated until 6 November; K0 evidence only in a scratch directory beforehand.

- Mainnet parsing follows guide 08's explicit Arc override, but this build's preflight still refuses mainnet. ENS mainnet is refused entirely because the active handoff requires testnets only.
- Vercel's current [WebSocket docs](https://vercel.com/docs/functions/websockets) include Socket.IO support. The compatibility question is therefore connection lifetime, durable in-memory rooms, a separate worker and shared durable storage, not basic WebSocket support. No deployment compatibility test has run.
- The old `ARKIV_SPONSOR_KEY` alias in guide 08 is historical, not an active env variable. The names-only template uses `ARKIV_CONSOLE_KEY`.

- S3 adds a room-end cleanup hook and graceful signal drain to the minimal wiring list: these prevent retaining closed rooms and dropping queued jobs at normal shutdown. Worker leases assume a single local/shared-volume host; multi-host workers are not supported. A provider must check its external idempotency record after a post-send crash; local files alone cannot guarantee exactly-once network effects. Foundation tests simulate that crash window, not a real chain.

- S4 makes the unspecified challenge lifetime configurable (`WEB3_BIND_TTL_SECONDS`, default 60), with the specified attempt limit configurable only downward (`WEB3_BIND_MAX_PER_MINUTE`, default/max 3). The phone key persists separately from seat tokens, per guide 01 §5.1; leaving clears the seat binding, not the reusable phone key.

- S5 uses an explicit minimal profanity/reserved-label list because the repo has no existing nickname filter. Confusable non-ASCII labels and markup are rejected; NFKC and whitespace normalization are deterministic. This is not a comprehensive moderation system. The minimum 3-second attempt interval is configured as `WEB3_NAME_COOLDOWN_MS`.

- S6 `verified` is explicitly scoped to the existing **game replay** verification, with `verificationScope: game-replay` and `chainVerified: false`. No mock receipt can claim chain verification. The canonical result is returned unchanged so its hash still verifies; names, seat credentials and full addresses are never added. Results are currently bounded local memory; external persistence is a later lane.
- S6 serves the Studio console only if its actual `dist/index.html` exists. Until A7, `/pot/` returns unavailable and real pot reads return 503. The foundation does not fabricate a contract, frontend or pot state.

- Final S3 hardening uses an actual SIGKILL/restart test around a durable mock effect, not merely an in-process exception. It verifies stale lease recovery and adapter lookup; live-chain exactly-once behavior remains unverified.
- G0 read-only discovery is partial. The first Arc domain check failed in our harness because `hashDomain` lacked its EIP712Domain types; this was fixed and the failed output retained. The primary RPC then passed; the legacy endpoint returned `Request exceeds defined limit.`. No failure was treated as a pass and live features remain off.

- 6 November setup check: the current Arkiv Hub lists Rabdi (7794095), whereas guides 04/08 specify Tiramisu (7738577). Arkiv funding instructions are held until K0 verifies network/SDK compatibility; no network substitution has been applied to production code. Official source: https://hub.arkiv.network/networks.

- ENS registration is explicitly authorized by the owner and uses only free Sepolia test tokens. Nevertheless, automatic approval review rejected broadcast twice and requires owner execution, even after an unsigned simulation and official no-monetary-value evidence. The complete commit/register script is prepared for manual execution; no alternative broadcast route was attempted. Parent resolver/subregistry remain unset until the planned bootstrap.

- ENS handoff resolved 6 November: owner completed mint/approve/commit/register. Independent read-only checks verified all receipts, ownership, expiry, expected roles and zero allowance. Public local config is updated without enabling live integrations. VE-01 is intentionally still open because child registries and their root-role checks are not built.

- G0 6 November: current Arkiv skills/Hub target SDK 1.0.0/Rabdi, but the plan pins 0.8.1/Tiramisu. Bounded public probes confirm Tiramisu still works and Rabdi rejects the 0.8.1 `contentType` selection. Keep the pinned target; do not infer the Hub faucet funds it. Matching official skills were read from a separate scratch checkout, not globally installed. No Arkiv MCP is available in this session.
- E0 local receipt watcher timed out despite an available mined receipt. The disposable-fork script now uses bounded direct receipt polling, requires successful status and never resends. Original failure retained; not generalized to live RPCs.
- Arc local native test reproduces `Cannot clear balance of empty account` on exact USDC drain; the 0.05 floor works. USDC token/native balances are two views of one balance, so a funded USDC seat cannot simultaneously have zero native USDC. The separate EURC test proves a zero-native signer can transfer gaslessly.
- Memo `eth_call` reverts on the official local Arc fork, despite deployed code; it succeeds in an unsigned live RPC simulation. The harness ABI was corrected to the verified no-return-value interface before the comparison. Plain-transfer fallback passes after the unsigned revert. Local Memo remains unavailable; no claim that a public Memo transaction/receipt is verified or that the simulator limitation is resolved. A sent/uncertain payment must never be retried through the fallback.
- Pre-event K0 scripts/evidence remain outside this repository at `/Users/raihankhan/Documents/Projects/chonks-arkiv-k0`. Only status, limitations and repro references are recorded here. No root Arkiv dependency or production schema added. Swarm immediate retrieval proves no 1 h/24 h/7 d retention claim.

## 6 November 2026 — current resolutions

- Owner explicitly approved Rabdi 7794095 / exact SDK 1.0.1. This supersedes 6 November “retain Tiramisu” decision; migration and schema/query differences are in rabdi-migration.md. 6 November date gate has elapsed; K1 waits on K0 evidence instead.
- Owner executed ENS bootstrap, Arc USDC probe and Rabdi phase one. Public receipts independently verified; no agent bypass of the earlier signing/broadcast rejection. Fourteen existing keys preserved and validated; no new secret archive.
- Owner authorized Studio app creation in Dia despite the master guide's default human-only wording. Created only a G0 diagnostic; future ConditionalPot prompts remain unsubmitted. Template telemetry removed; local Vite host restriction tightened after export. No deployments.
- The Rabdi SDK reserves bytes32 and exposes bytes columns, explicit indexes, server sorting/counts and latest-state pagination. Offline limit checks differ from the old plan. We record SDK evidence separately from live network boundaries and keep all remaining VK gates open.
- Scratch npm lock initially contained /private/tmp path entries and failed clean installation. Regenerated a portable exact-version lock in scripts/spikes/rabdi; root package-lock.json remains unchanged. One viem version is shared by both SDKs.
- Independent Rabdi verifier initially compared a decoded bool wrapper with a bare boolean fixture. Corrected the verifier to compare the right representation; rerun passes all 24 predicate checks. This was a harness issue, not a network failure.
- Swarm 1h/24h observations were not taken; all five original blobs were actually observed again after ~4.4 days, not backfilled as earlier observations. Seven days has not elapsed. No durability claim, postage purchase or fabricated retention evidence.
- Rabdi currently has one tested public RPC host. Independent owner-report verification does not imply the two-provider Ledger badge; the latter remains unbuilt.


## 6 November — final G0 preparation

- The first probe was only phase one. That incompleteness was agent-side scope execution, not missing Twitch/Google/Kick accounts. The final runnable matrix and verifier are now prepared; public signing still needs the owner under the earlier automatic approval-review rejection.
- Measured public RPC boundary: 131,072 bytes is SDK-valid but returns HTTP 413 / `BAD_REQUEST`; 129,000 bytes passes unsigned estimation. A follow-up worst-column check shows 128,000 bytes plus 31 columns also returns 413; 120,000 bytes passes. Lower the application payload cap to 120,000 and require a 256,000-byte serialized RPC request ceiling; split batches or move data to Swarm before signing. The cost table replaces the rejected case with 32 KB, with both requested and actual sizes recorded.
- Anonymous rate measurement is bounded at 32 small queries and eight concurrent requests. No 429 occurred; maximum measured sample was about 25.4 queries/second. This is a lower bound, not a guaranteed service limit or an invitation to stress a public endpoint indefinitely. Cached/bucketed reads remain the fallback.
- The Swarm keeper fallback is implemented/tested as a G0 prototype with a new synthetic blob and one injected missing-read response. It really re-uploads and verifies the same reference/hash. Original retention uploads remain untouched. Production keeper scheduling/wiring remains K1; no daemon is left running and no stamp was purchased.
- The plan mentions a Hall size budget but gives no numeric Hall threshold. The probe records its actual size and conservatively enforces 120,000 gzip bytes (118,552 observed), without changing the separately specified phone-signer budget. Final product Hall bundles must be remeasured.
- VA-12's future product-flow repetitions remain mandatory at those feature gates. G0 can verify the primitive drain/floor behavior before those flows exist; it cannot honestly claim tests of unbuilt pots, cheers, refunds or commerce. Memo receipts are VA-07/P1. CRE and Gas Station are explicitly stretch/polish in guide 03, and remain disabled/unverified; current official Chainlink docs list Arc testnet simulation support, but that is not a broadcast test.
- PublicNode intermittently timed out, and thirdweb returned an explicit 429 while forking. The successful ENS record rehearsal uses a serialized localhost read-only bridge with guarded provider failover; all upstream send/sign methods are rejected. Public owner sends retain zero automatic retries. DNS IPv4 preference alone did not resolve all outages.
- One new, separate EURC test key was necessary because the earlier USDC-funded developer key is no longer a zero-native signer. The 14 existing roles were preserved. The new key is local/ignored/0600; only its public address appears in evidence.
- HTTPS staging remains owner-deferred. Local engineering proof is distinct from guide 22's hosted acceptance. No hosting choice or production readiness is inferred.

## 6 November — interrupted-run recovery

- The owner-run final Rabdi probe stopped at 1,200 of 2,000 rows with `InternalRpcError`. The previous error line discarded the method/cause; the exact original failure cannot be reconstructed. Independent reconciliation finds all 74 admitted hashes confirmed, no pending transaction, and a successful unsigned estimate for the next batch. Continue the same journal; no new dataset or duplicate sends.
- Rabdi explicitly rejects historical balance reads: `arkiv serves state at the chain head only` / `GolemDB cannot read at a past commit`. Historical balance verification was an invalid harness assumption. Actual costs remain verified from canonical receipts; per-case balance deltas are preserved and labelled as owner observations. Current aggregate balance agrees with their starting observation minus the independently verified costs. Post-send checks use current state bound to the exact admitted nonce and receipt/value; unexpected balance movement still stops the runner.
- Added bounded retries only for allowlisted public reads and unsigned estimates (four attempts, 1/3/7-second waits). Reverts, validation, HTTP 413 and head-only-state errors are deterministic and stop immediately. Signed transaction submission still has no retry. Diagnostics emit safe method/code/attempt fields without raw payloads or keys.
- EURC faucet had reset to USDC/empty address and showed a reCAPTCHA connection error. Reloaded and visibly refilled EURC/Arc Testnet/relayer; owner submitted. Public balance now confirms 20 test EURC. This clears funding only; live authorization still awaits owner execution.
- A subsequent owner retry failed in unsigned preflight with a nested Node `ConnectTimeoutError`; the first read-retry classifier missed that concrete error type. Added Node/Undici timeout names/codes and exact-chain tests without changing the four-attempt ceiling or single-attempt broadcast rule. No new admissions occurred (74 receipts, nonce 80/80); the repaired combined unsigned preflight and 35 isolated tests pass.

## 6 November — G0 completion

- All signed G0 probes are complete and independently verified; no more owner funding/signing is pending for G0. Guide 22's P0 engineering checks pass or use its specified recorded fallback. Hosted acceptance is still owner-deferred; this completion must not be presented as a hosted release gate or a completed G1 product.
- Full-board reads measure 7.08–10.87 seconds, failing the five-second target. Apply the plan's tested bucket/stale-cache fallback (100-row query 0.91 seconds); production K1/Hall must carry it forward. No service-wide rate guarantee is inferred from the bounded probe.
- The one-hour cross-SDK fixture expired before the later agent verification. Preserve the successful at-completion typed readback and verify its canonical event/expiry plus exact reconstructed calldata; reject premature absence. This avoids repeat owner transactions and records expiry honestly. Three regression tests added.
- A repeat Rabdi read hit temporary DNS failure; a subsequent full public verification passed. No signing/broadcast retried. Future product-flow floor tests, Memo receipts, physical phones, platform apps, hosting and seven-day Swarm observation remain unverified/deferred.

## 6 November — G1 E1/E2 milestone

- The owner explicitly requested starting G1 after G0 engineering completion. Hosted acceptance stays deferred; this does not waive the final real-match/phone/hosted gates.
- ensjs 5.2.7 exposes the five other required protocol addresses but not RootRegistry. E1 uses the pinned official deployment for that address, compares all six against the current official docs and checks UniversalHelper.ROOT_REGISTRY on chain. No address is guessed. Drift makes this prerequisite preflight fail instead of silently proceeding with a warning.
- The production SDK is an isolated exact-version package under integrations/ens, installed with `npm run web3:install-ens`; no dependency on ignored `.tools` probe installations and no root lockfile edit. Root tests do not require installing the optional SDK. A separate `web3:preflight:ens` command verifies only read prerequisites; the general product preflight still refuses unfinished real providers.
- Added a public ENS_REGISTRAR_ADDRESS config field so independent ownership/role checks never need to load the worker's private key. The sample carries only the name/comment, no value.
- Corrected the progress table's E2/E3 attribution: the bootstrap/deployment handoff is E2; warm pool and party creation are E3. Restored the complete G1 reminder to include A6/A7 settlement and the pot console; the previous A2–A5 summary was not a scope cut.
- E1/E2 are implemented/verified at their stated scope. G1 as a whole remains in progress. No UI changed in this chunk; browser acceptance and physical phones are not newly claimed. Open questions: none for the next E3 implementation task.

## 6 November — G1 E3/E4 engine milestone

- The plan's one-register warm-open estimate does not work with arbitrary future room codes. Their DNS name and canonical parent label are unknown while prewarming. The verified implementation predeploys the registry/resolver, then performs setParent, one records multicall and register: three warm transactions, five cold. No one-block latency claim. Report: spikes/g1-ens-lifecycle-rehearsal.json, source Sepolia block 12074808.
- The first local rehearsal disproved the assumption that unregister alone stops seat address resolution: the party's inherited resolver still returned the stored address. Release now clears addr/chonks.seat/chonks.last and then unregisters; it also clears these records if a host already unregistered the seat. That is two transactions for an active seat and one cleanup transaction for an already-unregistered seat. The final rehearsal explicitly reproduces raw wildcard resolution after external unregister and verifies the fix. Canonical registration/expiry is always required for admission, including after parent end/expiry. No universal raw-null guarantee.
- E3/E4's engine and transaction port are implemented (`3dc111d`), not an activated gameplay provider. Outbox/relay metadata, the missing ens.seat.release job type, phone-binding hooks and background refill still need integration. E5's authority/cache/watch and E6's reads/history remain pending. Keeping the existing live-worker gate closed is deliberate; it prevents placeholder foundation jobs reaching a signer before the full flow is ready.
- The transaction port requires explicit cumulative journal cost/count/fee caps and stops on unresolved receipts or external nonce movement. Runtime per-room/per-hour policy and owner-operated activation remain integration work. No implicit unlimited budget or automatic resend is introduced.
- The new ABIs are extracted from the same pinned official artifacts as E1; lifecycle-abi-sources.json records hashes and functions. No optional SDK change, root lockfile change, game/core/SDK/motion edit or UI change. The final regression run has 691 tests; 11 contract checks and 23 transactions ran only on an Anvil fork. CAN/CANNOT here means eth_call simulation, not the required future public transaction-hash book.
- No new owner decision blocks the next implementation step. Public signing remains owner-operated under the earlier automatic approval-review restriction, but no new command is prepared/requested in this milestone. Hosting and physical-phone acceptance remain separately deferred.

## 6 November — G1 Arc modules and Studio review

- The games use competition ranks such as 1,1,3, while the contract requires dense 1,1,2. Normalize only the pot vector; never mutate the game result/hash. All valid two-to-four-seat vectors are tested.
- The old Arc appendix still contains removed rescue/allowance/CRE paths. The submitted specification explicitly excludes them using G0's successful payee-only authorization evidence and G1 scope.
- The plan does not configure a production minimum play time. The contract receives it as a required term; local tests explicitly use 60 seconds. No production value is silently chosen.
- Studio's interim contract uses an unbound opaque termsHash and narrows stake to uint128. These are audit findings, not accepted deviations. The saved audit prompt requires canonical binding and the specified uint256 behavior.
- Shared transaction-journal extraction preserves the ENS policy and journal path. Arc's zero priority fee is decoded by viem as an omitted zero field; the admission comparison now normalizes that value. Regression tests cover it.
- Pure stakes policy, drip budgets and transaction admission are implemented, but no live jobs or player controls are connected yet. Public signing/deployment remains owner-operated, with no new command requested before the full local flow is tested.

## 6 November — G1 ENS integration and authority

- E5 necessarily adds a gated delegated-phone authorization hook in `server/arcade.cjs` and revocation notification in `server/party.cjs`; off-mode parity remains green. TV/staff paths do not call ENS.
- The pinned resolver exposes `grantSetterRoles` and generic `revokeRoles`, not `revokeSetterRoles`. Decode the setter resource and revoke that exact resource/bitmap. Local deployed-contract permission checks pass.
- E6 history follows a verified creation transaction to a unique party resolver so ended tables remain readable. It is RPC-sourced, not independently verified. The later Ledger owns that badge.
- The existing main-screen join field has a six-character code pattern. On-mode table-name lookup progressively enhances it; the ordinary code path and synchronous motion-permission tap are preserved. Browser inspection caught and fixed low contrast and a clipped landscape error.
- Added explicit ENS lifetime gas/count/fee budgets and durable room/hour caps. No values were applied to the owner's config. Initial live runtime uses one configured RPC; no silent send failover. Independent multi-host acceptance is pending.
- The E3/E4/E5/E6 software is implemented, but public acceptance, A5 consuming the roster and E8 public CAN/CANNOT receipts are not done. Physical devices and hosting remain deferred. No agent public-chain signing occurred. See g1-ens-integration.md.

## 6 November — Arc contract and console acceptance

- Studio audit fixed the terms-binding and uint128 findings; neither is accepted as a remaining deviation. Canonical terms now include metadata and every financial/lifecycle field. The root helper was tested against deployed local bytecode.
- Studio had no browser/fork evidence. Independent local work adds 177 Foundry passes, 17 actual Arc-fork checks (both tokens), 219 console tests and 100 Chromium cases, explicitly separating fixture wallets from local chain transactions and public evidence.
- A7 source is isolated in `integrations/arc/pot-console/`; its compiled output is served by the already implemented router. No public shell/motion change is needed. The formerly environment-dependent missing-dist test now uses a temporary root.
- The plan's generic permissionless create interface is retained. Pot-id squatting is an unresolved availability concern for A4: use durable unpredictable ids, reconcile identical terms, fail closed on conflicts, never repurpose signatures, and require fresh acceptance when replacing a pot. This is not a claim that random ids eliminate transaction front-running. No live deployment is enabled.
- Receipt watcher timeouts during local rehearsal were resolved by bounded exact-receipt polling without resending. The failed runs were local only. Arc fork calls use the actual token implementations; issuer impersonation exists only behind the chain-31337 loopback guard.
- The console bundle is 159.81 KB gzip (main JS); Vite emits its ordinary 500-KB uncompressed chunk advisory. No build/test failure is suppressed. Real wallet approvals, physical devices, public deployment/receipt book and hosted acceptance remain pending.
- No new owner input is required for A4. Public signing remains owner-operated under the earlier automatic approval review; a complete bounded command will be prepared after integrated local acceptance.

## 6 November — A4 worker integration

- The guide's abbreviated job list omitted `arc.pot.contest`, `arc.pot.finalize` and `arc.drip` from the shared outbox registry despite requiring those flows. Added explicit typed jobs rather than overloading a different action.
- The old journal stopped an entire signer lane after any mined revert. Arc now accounts for a canonical reverted receipt, never resends that admission, and permits unrelated claims. An unknown/prepared receipt still blocks further sends. ENS retains its existing stop-on-revert policy.
- The spec's per-partner FIFO/backoff could prevent an unrelated pot refund behind a failing claim. Arc may continue independent jobs and deadline recovery; nonce admission remains serialized by each durable role port. No gameplay hot path waits on this work.
- Memo's N3 implementation depends on the separate L2 Ledger task. A4 uses plain calls and explicitly requires `ARC_MEMO=off`; it does not silently treat the default `on` as implemented. N3/L2 remains pending.
- Local fork time advances need a virtual clock following subsequent local blocks. The first A4 rehearsal correctly rejected a future/stale proof after the test clock stopped tracking those blocks. Only the local injected clock was repaired. Production freshness bounds remain 30 seconds old / 5 seconds future, with canonical-block rechecks.
- A4's unpredictably generated/persisted pot IDs and exact terms-conflict rejection are implemented. Generic permissionless creation still permits ID-squatting denial of service; signatures are never reused for replacement terms/IDs. This remaining contract availability finding is not labeled solved.
- Owner public acceptance now has concrete bounded preparation: Studio deployment prompt, exact-artifact/two-host pinner and public worker scenario. The agent did not run a public signing command; the earlier approval-review restriction remains. A4 software/local acceptance is complete, but the guide's **public testnet** criterion remains pending, as do A5/A6 gameplay, physical phones and hosting.

- Full scenario replay exposed redundant historical receipt reconciliation for already-paid pots. Fresh state checks remain; completed claims skip repeated journal walks only once their evidence is verified. Unavailable claim evidence remains recoverable across restart without another send. Receipt metadata is saved once per reconciliation pass when it changed.
- One repeat local-fork run stopped with `InternalRpcError`; its original cause was unavailable. The journal was retained and no resend attempted. Added bounded local simulator diagnostics; a fresh final run passed all 18 checks and 54 worker transactions. Public RPC availability is not guaranteed.
- Final two-host balance check found the separate oracle unfunded (zero test USDC), even though the relayer is funded for both assets. Added the exact 0.10-test-USDC minimum owner funding step to the handoff; no automatic transfer/faucet action was performed.

## A4 deployment handoff correction — 6 November

- The owner ran the prepared Studio prompt; Studio returned no deployment, signature or transaction. The prompt mistakenly prohibited the receiving coding agent from the action it requested. Independently, Studio reported its deployment tool cannot enforce fee fields, direct-creation shape, a total gas ceiling or no-resend behavior. The prompt is retired; do not send the owner back through it.
- Retain Studio contract provenance and all original ceilings. The exact four source digests and 15,459-byte creation payload match the owner's Studio output and local build. The new owner-run local command uses the existing funded relayer, a fixed reviewed creation pin, both-host preflight and automatic two-host deployment pinning; no service activation or artifact changes.
- Measured unsigned gas is 3,206,129; the 20% margin is 3,847,355. A fixed twice-base-fee admission would exceed the 0.1-test-USDC ceiling. The deployment runner uses the current quoted fee, bounded below by base fee/20 gwei and above by 100 gwei, then enforces the total 0.1 ceiling. It never bumps/replaces/resends. The observed final preflight admitted 0.0769471 test USDC.
- Twelve guard tests, 793 total tests, and the real-fork deployment/reconciliation plus all 54 worker transactions pass. Oracle funding is now independently verified at 20 test USDC. Public deployment/worker execution still awaits the owner; the agent has not run either apply command.

- The owner signed the direct deployment, which succeeded under the ceiling. The wrapper then stopped with `INVALID_PROOF`; its exact first failing field was not recorded and is not guessed. Subsequent read-only reconciliation checked the same admitted hash on both hosts, confirmed all fields and cost 0.06359452 test USDC, and saved the deployment pin. No second deployment occurred. Future receipt failures now preserve the failed predicate names in the private journal; verification conditions and no-resend behavior are unchanged.

- The first public worker run admitted and mined one USDC drip, then encountered `RECEIPT_MISMATCH` on immediate proof. The one-poll acceptance wrapper tried to read a missing receipts file and masked that with `ENOENT`. Both-host read-only reconciliation verifies the original hash/cost. The wrapper now waits through the worker's existing bounded backoff (three-minute per-step ceiling), treats absent receipts as pending, and preserves step/error codes. A real-outbox regression proves a post-effect retry produces only one effect. No limits, identities or transaction resend rules were relaxed.

## A4 RPC rate-limit handling — 6 November

- The owner-reported `UNAVAILABLE` lacked its underlying error; no exact retrospective cause is asserted. An instrumented read-only reproduction returned `LimitExceededRpcError` / -32005 during preflight balance reads. The transaction journal still contains only the first successful drip.
- Removed duplicate startup preflight. Added an explicit read-method allowlist with four bounded attempts for rate limits/transport outages, Retry-After support and no retries for sends/signatures/mutations/unknown methods. Wrong-network/code/domain responses still cannot fail over. Freshness/canonical/budget rules are unchanged; a long outage still stops safely.
- Added a no-poll/no-sign startup check and allowlisted phase/method/cause diagnostics so future failures are actionable without leaking RPC bodies, signatures or keys. The actual existing fixture/provider startup passes on both hosts. No additional public transaction was signed or sent by the agent.
- Original unrecorded exception remains unknown; public worker flows and their final independent readback remain open. No new owner decision is required, but public signing continues to require the owner under the earlier approval-review restriction.

## A4 background-outcome wait — 6 November

- The rate-limit repair let the public scenario progress through USDC funding and cooperative settlement. The next failure was a separate single-poll assumption at background refund/finalization checkpoints: a mined transition can precede canonical readback and completed claims. The observed recovery error was `RECEIPT_MISMATCH`; the wrapper then raised `ERR_ASSERTION`. Both hosts confirm the original refund.
- Recovery waits now require the expected terminal state and zero outstanding claims, using the existing worker and admissions, with a bounded timeout and exact step diagnostics. Proof failures and wrong terminal states are not hidden. A local fork injects the observed readback lag twice and proves no duplicate refund across full replay. No monetary cap, identity, signature or contract change.
- Added a standalone keyless two-host final verifier. It rejects partial runs and active worker locks and cannot sign; it is a reproducible A4 audit, not the future product Ledger badge. Public completion remains pending owner resume and this audit.

## A4 explicit exact-hash recovery — 6 November

- The latest pending finalization is distinct from the earlier mined-but-delayed refund. Both RPCs report the final hash absent and nonce 52 unused. The original admission has no dispatch stage, so whether submission occurred is unknown; no retrospective cause is invented.
- A one-time **owner-authorized** recovery is prepared outside the worker. It reconstructs exactly the original hash/nonce/calldata/fees, with two-host absence/nonce/simulation checks and a write-ahead marker. This is an explicit exception for the reviewed saved admission, not an automatic retry policy. Uncertain recovery dispatches cannot be repeated. Original spending caps and role journals are preserved.
- Resume only the final claims instead of replaying all eleven successful checkpoints. Completion requires canonical journal status in addition to zero on-chain claims. No new fixture, gameplay change, public agent transaction or browser acceptance claim. Public execution and final keyless audit remain open; no new account/funding decision is needed.

## A4 confirmed finalization after owner proof failure — 6 November

- The explicit owner dispatch succeeded. Its marker recorded acknowledgment, then the helper threw `INVALID_PROOF` without a predicate name. Later both-host reads pass all original checks; the original failed condition is unknown. No root cause or network guarantee is invented.
- Reconciliation uses no key and blocks network writes; only the existing receipt/marker metadata is updated. Finalization is complete on-chain, with two payout claims outstanding. No replacement, resend or extra fixture was created.
- Future failures preserve allowlisted predicate names without raw error bodies. A missing immediate transaction block hash is covered as a regression, but is not asserted as the cause of this public failure. Strict proof checks and no-resend behavior stay unchanged. The remaining claim signatures still require the owner under the prior automatic approval-review restriction.

## A4 public acceptance closed — 6 November

- The owner completed the original capped fixture. Independent keyless audit confirms all 54 receipts and eight paid terminal pots through both hosts; no public agent write, reset or new fixture was used. The earlier A4 signing/claim blockers are resolved.
- No deviation from A4's scripted testnet acceptance requirement remains. Its synthetic relay result fixtures do not satisfy A5/A6 gameplay, Ledger badges, physical phones or hosted G1 acceptance. Unknown earlier proof-failure causes remain unknown; no reliability guarantee is inferred.
- Service modes are unchanged. Next implementation is A5/A6; no additional A4 owner decision or signing command is requested.

## 6 November — expedited A5/A6 scope

- The owner explicitly prioritized basic working flows and refund caveats over an exhaustive scenario matrix. Added six focused integration tests and one actual two-phone browser game; reused the existing policy, payout, contract and worker suites. G1/G2 remain open.
- Interactive stakes are exercised in an isolated MOCK room, not the wallpaper demo. The desktop baseline offers USDC; EURC remains supported by server/signer/worker and awaits the broader asset-selector UI.
- Phone-only text is lazy-loaded from `public/party/phone-stakes-copy.js` so shared strings do not exceed the unchanged 600 KB initial desktop budget. Shell strings remain in `public/os/strings.js`.
- Public gameplay and full relay/phone room restoration are not claimed. Worker-owned refund/claim recovery remains durable. Public signing stays owner-operated; physical sensors and hosting stay deferred.
