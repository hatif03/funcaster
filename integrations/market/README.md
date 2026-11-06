# Funcaster predictions and table cheers

This slice supplies a usable **local play-coin** product and an explicitly injected Arc lifecycle. It does not enable public transactions or treat mock receipts as Arc proofs.

## Run the basic flow

- Set `PARTNERS=mock` and `MARKETS=mock`. Open winner predictions from the host lobby after two to four ready humans have bound their phone identities. This listing is opt-in; it does not expose the room join code.
- Open `/predict` on spectator phones. Each browser uses the existing local Funcaster signer, proves its address, receives a private session and 1.00 local play coins. Pick a player, choose an amount, confirm. Predictions carry a signed minimum-payout estimate and cannot be changed by the relay. Seated players are excluded.
- The betting window is 30–120 seconds, followed by the five-second start guard. Lineup changes void the listing. A separate process replays the final canonical record before a second distinct key attests; matching reports lead to payouts after the liveness window. Failure, abandonment, timeout and a one-sided pool produce refunds. Collect through the private pull-claim action.
- A 0.05 cheer shares equally among the frozen human seats after a verified finish. It changes no score or winner. An unsuccessful match refunds the contributing spectator. The same durable ledger and private identity are reused.
- `/predict?demo=1` is a view-only fixture; it cannot send coins. Local coins are not USDC and have no withdrawal path.

## Integration ports

`server/market/index.cjs` exports `createMarkets({config, now, changed, onReceipt})`: `router` mounts at `/api/web3`, `namespace(io)` attaches the read-only `/market` directory feed, and room hooks are `choose`, `observe`, `startReason`, `started`, `finish`, `end`, `view`, and `close`. `ready` resolves the store. `choose(room,{listed,windowSeconds})` is host-authorized by the caller. `finish(room,{result,replay})` must receive the canonical server record. Public rows use random identifiers and a field allowlist; personal balances and positions require the bearer session.

`onReceipt` publishes `market.bet`, `market.cheer`, `market.claim`, and `market.void` **local** receipts only after durable coin state. It includes no room code, token, seed or spectator address. Callback failures leave durable activities for reconciliation. The local ledger lives under `WEB3_DATA_DIR/markets/`, outside served files; pending rounds refund on restart.

The explicit live path is `createMarketChain({client,deployment,now,localGuard?})` plus `createMarketLifecycle({dir,chain,transactions,roles,verifierKey,killed?})`. It loads no credentials and does not activate itself. `deployment` requires the actual contract, chain ID, runtime `codeHash`, asset metadata and explorer. Every transaction admission rechecks a fresh canonical block, pinned code, immutable token allowlist and actual token EIP-712 domain. Mainnet is refused; chain 31337 requires the injected localhost guard.

`transactions` injects **three distinct, budgeted existing Arc transaction ports** named `operator`, `reporterA`, and `verifierB`, with corresponding public addresses in `roles`. Use separate journal directories for each signer. Their `transact` and `receipts` methods retain the shared admission, budget, fee, nonce and no-automatic-resend protections. Jobs persist exact request hashes; retries reconcile saved canonical transaction events before any new admission. `createMarketProvider({lifecycle})` supplies the worker's `execute`, `lookup`, `idle`, and `close` ports.

Live job types (all carry `idempotencyKey` and private `payload`):

| Type              | Payload beyond opaque `marketRef`                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `market.create`   | Immutable contract `params` and `context:{gameId,bundleHash,slots}`                                           |
| `market.started`  | Exact canonical `matchId`, bound once after the chain close + guard                                           |
| `market.bet`      | `bettor,outcome,amount,minPayout,validAfter,validBefore,salt,signature`; EIP-3009 nonce is `marketNonce(...)` |
| `market.report`   | `layer:"A"                                                                                                    | "B"`, full private `{result,replay}` record; B invokes the separate verifier process |
| `market.finalize` | No additional fields; matching reports + liveness required                                                    |
| `market.cancel`   | Before-close lineup cancellation only                                                                         |
| `market.void`     | Permissionless deadline or one-sided-pool refund                                                              |
| `market.claim`    | Exact previously admitted `bettor`; cannot redirect payout                                                    |

`recover()` advances eligible finalizations/voids and pulls each known bettor's payout independently. An isolated blocklisted claimant does not block other claims. Basic live jobs enforce zero fee, 0.05 minimum, 1.00 per address, 25 pool cap, a retained 0.05 token floor and player exclusion. Receipts deliberately keep `chainVerified:false`: the separate independent Ledger audit earns that badge.

## Studio source and checks

Separate app: <https://studio.arc.io/app/3901b893-7c4c-4a97-9506-962259ffef4a>, CLI session `funcaster-markets-basic`. The existing audited ConditionalPot app was untouched. Studio generated `ChonksMatchMarkets`, `SplitPayout`, tests and ABI exports; nothing was publicly deployed. `onchain/BUILD-RESULTS.md` is the unmodified Studio report. Only contract build paths/remappings were adapted locally to reuse the pinned Arc OpenZeppelin/forge-std dependencies.

- `node --test tests/web3/market*.test.mjs`: math vectors, exact rounding, signed intent tampering, exclusions, caps, close, refunds, durable restart, separate-process real replay, chain/code freshness and role separation.
- `.tools/arc-foundry/forge test --root integrations/market/onchain --summary`: 71 generated contract tests (38 markets, 33 cheers).
- `node scripts/market-browser-smoke.mjs`: two real Chromium spectator sessions, predictions, cheer, private directory/auth, actual replay and pull payout; 320×568, 390×844, 844×390, 1280×720. Screenshots are written to the system temporary `chonks-market-ui` folder. All test servers and browser processes close afterward.
- `node scripts/market-live-rehearse.mjs`: real localhost Anvil contract creation, EIP-3009 bets, both reporting keys, independent replay, tie settlement/claims, one-sided refund recovery and restart without duplicate send. Uses generated disposable keys and a **test token**, not public Circle tokens. The fixture supplies three mock token metadata/pause views missing from Studio's test token; actual signatures, balances, market calls and receipts run in the EVM. No public requests or broadcasts.

## Deliberate basic-scope limits

Public market activation requires owner deployment/runtime pins, funded roles and explicit configuration. The live HTTP product and SplitPayout worker are now implemented: real quotes, EIP-3009 signatures, durable queue admissions, fresh chain views, isolated verifier reports, refunds and payout recovery. The phone distinguishes queued requests from confirmed balances and receipts.

## Live service handoff — 6 November

`createMarkets` additionally accepts `outbox`, `readReceipt: id => readJobReceipt(dir,id)`, optional injected `liveChains`, and `requestDrip(address,{ip})`. Private live state uses the shared `atomicJson/readJson` adapter, inheriting PostgreSQL routing. Intent/action state is persisted before enqueue; HTTP acknowledges only after durable queue admission. `POST /market/quote` returns bounded terms and `/market/bet` accepts only that phone's stored quote and valid EIP-3009 signature.

Main service: `createLiveMarketProviders(config,{transactions:{operator,reporterA},chains?})` reuses the common Arc nonce journals. It never loads B's key. Separate verifier service: `createMarketVerifierProvider(config,{transaction,chains?})` owns only `MARKET_VERIFIER_KEY`, consumes `verify.market` / `verify.cheer`, reads the frozen private match from shared storage, independently replays it, checks the actual deployed player/authority roster, and submits B's report. Main recovery observes matching chain reports and settles/claims. A and B remain services controlled by the same operator.

Additional jobs: `cheer.create`, `cheer.started`, `cheer.contribute`, `cheer.report`, `cheer.cancel`, `cheer.void`, `cheer.claim`, `verify.market`, `verify.cheer`. Creation jobs use `params.asset`, mapping to the market ABI's token field internally, so the queue's secret-field prohibition stays intact. Receipt data remains whitelisted and `chainVerified:false` until the independent ledger audit.

Both chain adapters share in-flight/read caching for three seconds. Relay background polling is capped at once per three seconds and terminal table snapshots stop polling. All accepted proofs retain the thirty-second freshness bound. Verified phones have separate HTTP rate buckets even behind a shared venue IP.

`onchain/deployment-artifacts.json` contains ABI, compiler settings, source hashes, bytecode, immutable constructor assets, unsigned creation calldata and expected runtime hashes for both contracts. It contains no credentials. This lane has performed no public signing, funding or deployment.

Validation: **13 focused Node tests**, the existing **71 Foundry contract tests**, and **nine actual localhost-EVM checks**, now including HTTP → durable queue → main/verifier workers → prediction and cheer contributions → matching reports → payouts. Real Chromium additionally verifies the live UI's bounded signature and honest queued/confirmed balance display through an explicitly synthetic API fixture, at phone and desktop widths. PostgreSQL/Render deployment verification belongs to the root deployment lane.

Only the Winner template is supplied. Beat-the-line, external CRE quorum, World/personhood, Sybil-resistant bankroll, seed commitment, predictions history leaderboard and richer TV odds boards remain out of this basic slice. A and B are separate processes/keys operated by the same team. The generated contract uses a sequential on-chain market ID behind the opaque public reference and fixed code semantics rather than a configurable `rulesHash`; keep the frontend/worker version pinned together. The UI uses zero fees and no sponsor bonuses; the generic contract additionally supports bounded fees and bonuses. This is local/testnet software, not a completed real-value deployment or audit.
