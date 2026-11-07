# Build guide 08: configuration, keys, funding, hosting and operations

> **Owner-approved update, 6 November 2026:** Rabdi 7794095 / exact Arkiv SDK 1.0.1 replaces Tiramisu/0.8.1 and the old query/schema assumptions below. Follow [the migration and measured limits](../../../web3/rabdi-migration.md); all K0 gates still apply.

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** Names below are the specified names; the config loader (task S1) validates them and gives a plain error for a bad value. Facts about the chains are from [02](02-ens-guide.md), [03](03-arc-guide.md) and [04](04-arkiv-guide.md) and must be re-read on the day.

## 1. Separate environment files, never one

The relay process must **never** hold a signing key or a platform secret. So:

- **`.env.relay`** (public configuration only): read by `server.js` (`npm run start:web3` runs `node --env-file=.env.relay server.js`; Node 22 supports `--env-file`, and the repository requires Node 22.12 or later). Nothing in it is secret.
- **`.env.worker`** (keys and spend limits): read only by the worker (`npm run web3:worker` runs `node --env-file=.env.worker scripts/web3-worker.mjs`).
- **`.env.gateway`** (streamer lane only, [25](25-streamer-network-and-after-hours-economy.md)): platform OAuth secrets and webhook secrets, read only by the separate gateway process (`npm run web3:gateway` runs `node --env-file=.env.gateway scripts/web3-gateway.mjs`). It holds no chain key. The relay receives only verified, normalised events from it.
- All of them are gitignored (the repository ignores `.env` and `.env.*` except `.env.example`, `.env.sample`, `.env.template`); ship `.env.example` with every name and a comment, **no values**.

## 2. Variables

### Shared and relay (`.env.relay`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PARTNERS` | `off` | `off` (identical to `main`), `mock` (local providers, no network), `on` (real) |
| `WEB3_ENS`, `WEB3_ARC`, `WEB3_ARKIV` | follow `PARTNERS` | Per-partner override (`off`, `mock`, `on`) so lanes can be tested separately |
| `WEB3_DATA_DIR` | `.local/web3` | Outbox, receipts, warm pool state, done-set; must be a writable volume when hosted |
| `PUBLIC_ORIGIN` | (existing) | Required when hosted: invite and QR origin, and the socket origin check; the party name records carry it |
| `PLAY_MONEY` | `1` | Forces the PLAY MONEY labels; the build has no real-value mode ([the stakes plan](../08-stakes-product-and-legal.md)) |
| `ENS_CHAIN` | `sepolia` | `sepolia` or `mainnet` (mainnet only if resolution is live; see [02](02-ens-guide.md) section 12) |
| `ENS_PARENT` | (none) | The team's parent name on that chain, for example `funcaster.eth` if available |
| `ENS_RPC_URLS` | (public list) | Comma-separated, tried in order; **chunk `getLogs`** (some public RPCs cap ranges; Alchemy's free tier caps at 10 blocks) |
| `ENS_EXPLORER_URL`, `ENS_APP_URL` | the Sepolia explorer and app | Links shown in the Chain window |
| `ENS_ENFORCE` | `soft` | `soft` falls back to the token model **and says so** when the chain cannot be asked; `strict` refuses; a chain **no** is always a no |
| `ENS_PARTY_TTL_HOURS` | `4` | Party and seat expiry (the room cap is 4 h) |
| `ENS_WARM_POOL` | `3` | Pre-deployed registry and resolver pairs kept ready |
| `ARC_CHAIN_ID` | `5042002` | Arc testnet. **The loader refuses `5042` (mainnet) unless `ARC_ALLOW_MAINNET=1`**, to make real value impossible by accident |
| `ARC_RPC_URLS` | `https://rpc.testnet.arc.io`, then `https://rpc.testnet.arc.network` | Tried in order; both host families appear in working code |
| `ARC_EXPLORER_URL` | `https://explorer.testnet.arc.io` | Legacy `https://testnet.arcscan.app` as a fallback |
| `ARC_USDC` | `0x3600000000000000000000000000000000000000` | The pot's token (6 decimals); read `decimals()` in preflight |
| `ARC_POT_ADDRESS` | (set after the Studio deploy) | The deployed `ConditionalPot`; verify code exists in preflight |
| `ARC_STAKE_PRESETS` | `0.50,1.00,2.00` | The Stakes row choices (play-USDC) |
| `ARC_FUND_DEADLINE_SECONDS` | `180` | Time to fund after terms are accepted |
| `ARC_SETTLE_DEADLINE_SECONDS` | `900` | After this a locked, unsettled pot is refundable |
| `ARC_CHALLENGE_WINDOW_SECONDS` | `120` | The oracle path's objection window (minimum 60) |
| `ARC_ORACLE` | `relay` | `relay` (layer B) or `chainlink` (layer C) |
| `ARKIV_RPC_URL`, `ARKIV_WS_URL`, `ARKIV_PROJECT` | the Tiramisu URLs, `chonks_mumbai_2026` | Public reads and the live watcher (`ARKIV_APP` is renamed `ARKIV_PROJECT`; the attribute is `project`) |
| `ARKIV_TRUSTED_CREATORS` | (this console's address) | Comma-separated addresses of **trusted consoles**: reads run one `createdBy` query per address and show "published by" (public, not keys). Replaces `ARKIV_SPONSOR_ADDRESS` |
| `ARKIV_LEASE_LIVE_S`, `ARKIV_RENEW_LIVE_S` | `90`, `30` | The live directory lease and its renewal |
| `ARKIV_PROFILE_DRIP_GLM` | (measured in K0) | The GLM sent to a phone that opts into a profile; capped per device and per hour |
| `SWARM_API_URL` | `https://api.gateway.ethswarm.org` | The **API** host (never `gateway.ethswarm.org`, the web host); where the worker uploads and where programs read |
| `SWARM_BATCH_ID` | (none) | Optional own postage batch (needs a Bee node); without it the gateway stamps uploads and the keeper protects retention |
| `SWARM_KEEP_HOURS`, `SWARM_UPLOAD_WAIT_S` | `1`, `60` | Keeper interval; how long the worker waits for Swarm before writing a result without references |
| `FEATURE_CHALLENGES`, `FEATURE_CHEERS`, `FEATURE_AUTOPILOT`, `FEATURE_SEASON`, `FEATURE_FOLLOWS`, `FEATURE_SHELF`, `FEATURE_AGENTS`, `FEATURE_SWARM_HALL`, `FEATURE_PRIVATE_REPLAYS` | `off` | The extension features of [20](20-feature-expansion.md). Each defaults **off** and is switched on only when its spike in [19](19-verification-and-fix-protocol.md) is `PASS` or `PASS-WITH-LIMIT` with the fallback in place; `web3:reality` refuses a flag that is on with a failing spike |
| `MARKETS` | `off` | `off`, `mock`, `on`: the spectator prediction market ([10](10-prediction-market.md)); follows `PARTNERS` if unset |
| `MARKET_ASSET` | `usdc` | `usdc` (the Arc bounty instance) or `play` (the optional play-token instance) |
| `MARKET_WINDOW_SECONDS` | `60` | The default betting window (30 to 120) |
| `MARKET_GUARD_SECONDS` | `5` | Minimum gap between the on-chain close and the match start |
| `MARKET_LIVENESS_SECONDS` | `90` | The veto window after matching reports (60 to 120) |
| `MARKET_RESOLVE_DEADLINE_SECONDS` | `1800` | After this anyone can void an unresolved market |
| `MARKET_QUORUM` | `2` | Matching reports required (layers A and B by default; add C for the recommended setting) |
| `MARKET_MIN_BET`, `MARKET_MAX_PER_ADDRESS`, `MARKET_MAX_POOL` | `0.05`, `1.00`, `25` | Play-coin limits |
| `MARKET_BONUS` | `0` | Optional sponsor bonus per market (play coins) |
| `MARKET_BANKROLL`, `MARKET_REFILL_BELOW` | `1.00`, `0.10` | Starting bankroll and the refill threshold (once a day per device and per World nullifier) |
| `MARKET_LISTED_DEFAULT` | `kiosk` | `kiosk` (listed by default in Kiosk mode), `none`, or `all` |
| `MARKET_POT_ADDRESS` | (set after deploy) | The deployed `MatchMarkets` |
| `WEB3_ASSETS` | `usdc,eurc` | The assets the room may use ([16](16-arc-native-features.md)); each pot or market names one |
| `ARC_MEMO` | `on` | Wrap relayer calls in Memo (EOA relayer only); `off` falls back to plain transactions |
| `LEDGER_RPC_SECONDARY` | (the second RPC host) | The independent host used by the verifier ([12](12-reality-and-ledger.md)) |
| `LEDGER_CONFIRMATIONS_SEPOLIA` | `3` | Arc needs none (deterministic finality) |
| `LEDGER_CHECKPOINT_MINUTES` | `10` | How often the Ledger head is published |
| `STATS_RULESET` | `stats-ruleset-v1.json` | The hash-pinned ruleset ([14](14-stats-and-leaderboards.md)) |
| `STATS_SEASON_SALT` | (random per season) | Salt for the per-season `humanId` |
| `STAKES_MIN_LEVEL` | `L1` | `L1` or `L2`: the identity level required to stake ([13](13-users-scenarios-and-accounts.md)) |
| `STATION_MODE` | `off` | Allow staff to enable the Predict station mode |
| `INTEGRITY_ACT` | `0` | `0` log-only, `1` act on flags; **keep 0 until a baseline of real human matches exists** ([15](15-integrity-and-anti-cheat.md)) |
| `LOG_LEVEL` | `info` | |

### Worker only (`.env.worker`)

| Variable | Meaning | Guard |
| --- | --- | --- |
| `ENS_REGISTRAR_KEY` | The key that creates registries, mints seats, writes records, grants and revokes | Per-room and per-hour transaction caps; low-balance alert |
| `ARC_RELAYER_KEY` | Submits funding authorizations, `create`, `settle`, `claim`, `refund`; **pays all Arc gas** and bankrolls play money | `ARC_DRIP_MAX_PER_ROOM`, `ARC_DRIP_MAX_PER_IP_HOUR`, `ARC_MIN_RELAYER_BALANCE`; never holds stakes |
| `ARC_ORACLE_KEY` | Signs `propose` (layer B); a **different key** from the relayer | Can only propose a placing |
| `ARKIV_CONSOLE_KEY` (was `ARKIV_SPONSOR_KEY`) | Creates, extends, deletes and transfers this console's Arkiv entities; sends the profile GLM drip | A separate process; the **only** user of this wallet's entity-minting nonce; entities by non-allowlisted wallets are ignored on read; cannot edit a transferred profile or a readonly result |
| `WEB3_KILL` | `1` stops all sending (also: the file `${WEB3_DATA_DIR}/KILL`) | The relay then shows health `down` and rooms carry on |
| `WEB3_MAX_TX_PER_ROOM`, `WEB3_MAX_TX_PER_HOUR` | Spend and abuse caps | |
| `MARKET_OPERATOR_KEY` | Creates, cancels (before close) and funds bonuses | A separate key; cannot move resolved markets or block claims |
| `MARKET_REPORTER_A_KEY` | The relay's report signer (layer A) | A separate key |
| `MARKET_PERMIT_KEY` | Signs the bet permits (seated-player exclusion, per-human caps) | A separate key; can refuse bets, can never block claims or refunds |
| `MARKET_VERIFIER_KEY` | Layer B's signer, held by the **separate verifier process** (`scripts/web3-verifier.mjs`, its own env file and ideally its own machine) | **Never in the relay's or the main worker's environment**; it also needs `MARKET_VERIFIER_TOKEN` to fetch replays |
| `CHECKPOINT_SIGNER_KEY` | Signs the daily stats checkpoint and the Ledger head | A separate key; publication goes through Memo from the relayer |
| `ARC_RELAYER_KEY_2` | A second relayer, so one censoring relayer cannot stop bets | Gas funds only |

### Creator commerce (`.env.relay`, public; [23](23-creator-platform-and-economy.md), [24](24-business-model-and-revenue.md))

All default `off` or unset; the loader validates them only when `FEATURE_CREATOR=on`. **Fee numbers are configuration read at deploy, and the contract freezes them per game at registration.**

| Variable | Default | Meaning |
| --- | --- | --- |
| `FEATURE_CREATOR` | `off` | The creator commerce slice (router, passes, Creator Studio) |
| `ROUTER_ADDRESS`, `CREATOR_POOL_ADDRESS`, `BOUNTY_ESCROW_ADDRESS` | (set after the Studio deploy) | The Arc contracts of [23](23-creator-platform-and-economy.md); preflight checks code exists and the EIP-712 domain matches |
| `ROUTER_FEE_FREE_BAND_USD` | `1000` | Gross per game with a 0% platform fee |
| `ROUTER_FEE_CREATOR_BROUGHT_BPS`, `ROUTER_FEE_STANDARD_BPS`, `ROUTER_FEE_CAP_BPS` | `500`, `1000`, `1500` | Platform fee by source; the hard cap (basis points) |
| `ROUTER_REFERRAL_MIN_BPS`, `ROUTER_REFERRAL_MAX_BPS` | `500`, `2000` | The referral slot's floor and cap |
| `PASS_PRESETS_USD` | (set in CP3) | The pass prices offered at the start gate (the 24 pricing section gives the options to test) |

### Streamer network (relay: public; gateway: secret; [25](25-streamer-network-and-after-hours-economy.md))

`.env.relay` (public):

| Variable | Default | Meaning |
| --- | --- | --- |
| `STREAMERS` | `off` | `off`, `mock` (recorded fixtures, no network), `on`; with `off` the relay is byte-identical to `main` |
| `STREAM_PLATFORMS` | `twitch` | Comma list of enabled adapters: `twitch`, `kick`, `youtube` |
| `STREAM_EVENT_DEDUPE_HOURS` | `24` | A platform event id never triggers twice inside this window |
| `STREAM_LINK_TTL_SECONDS` | `120` | `!link word` lifetime (single use) |
| `STREAM_TRIGGER_CAP_PER_MIN`, `STREAM_TRIGGER_COOLDOWN_S` | (set in SL7) | Global caps; triggers are cosmetic only |
| `STREAM_KILL_COMMAND` | `!arcade off` | Chat command that blanks the overlay in under a second |
| `YOUTUBE_QUOTA_DAILY_UNITS` | (the granted quota) | The gateway stops polling before it is exhausted |
| `GATEWAY_SOCKET` | `${WEB3_DATA_DIR}/gateway.sock` | Where the relay listens for verified events |

`.env.gateway` (secrets; the gateway process only): `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_EVENTSUB_SECRET`, `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GATEWAY_TOKEN_KEY` (encrypts stored OAuth tokens at rest). Never log them. No Bits, Super Chat, Kicks or gift amount is ever forwarded (VG-06).

The creator and streamer contracts reuse `ARC_RELAYER_KEY` for gasless relaying; a contract that names its own operator in its specification gets its own key in the worker table above.

`ARC_STUDIO_TOKEN` is for the developer's CLI session only: **never put it in either server env file**.

## 3. Wallets, funding and who does it (do this 6 November; several steps need a human)

| Wallet | Chain | What it needs | How | Notes |
| --- | --- | --- | --- | --- |
| ENS registrar | Ethereum Sepolia | Sepolia ETH for gas (a few registrations and dozens of small transactions per hour); free MockUSDC for the parent registration (`mint`, then `approve`) | Public Sepolia faucets; the mock token's free `mint` | Spare key funded as well |
| Arc relayer | Arc testnet | The event's **play-USDC bankroll** (gas is USDC too) | `https://faucet.circle.com`: **20 USDC per request per address every 2 hours, behind a reCAPTCHA**; so several team members request to their own addresses over several days and transfer to the relayer | Keep stakes tiny (0.5 or 1.00); a spare relayer key funded as well; the drip is capped |
| Arc oracle | Arc testnet | A little gas | Faucet | Different key |
| Arkiv console (one per console; the two-console demo needs two) | Arkiv Tiramisu | Test GLM (writes, lease renewals every 30 s per live match, the profile drip) | `hub.arkiv.network/faucet` (wallet sign-in and CAPTCHA, **a human step; fund early**) | A spare key funded as well; measure gas per create in K0 and size the budget from it |
| Swarm | none by default (public gateway) | (optional) a Bee node and a postage batch | n/a | The keeper re-uploads from the local store |
| Developer wallet | any | For deploying and testing by hand | Faucets | Never a production wallet |

**Generate fresh keys** for every role (never reuse a personal wallet), keep them in a password manager, and record only **addresses** in the evidence files. Rotate any key that was ever pasted into a chat. A phone's session key holds only the play money it is dripped.

## 4. Preflight (`npm run web3:preflight`; `--mock` skips the network)

Checks, each with a plain pass or fail line:

1. Config loads; mainnet refused unless overridden; `PLAY_MONEY=1`.
2. **ENS:** RPC reachable (each URL); chain id; protocol addresses printed and **diffed against the docs page** (warn on mismatch); the parent exists and the registrar key holds the roles (including the admin variants); the `play` registry resolves; warm pool count; registrar balance above the floor.
3. **Arc:** RPC reachable (both host families); chain id 5042002; USDC `decimals()` equals 6; the pot has code at `ARC_POT_ADDRESS`; the pot's `eip712Domain()` matches the signer helpers; relayer balance above `ARC_MIN_RELAYER_BALANCE`; a base-fee read confirms the 20 gwei floor handling; a dry-run `create` simulation.
4. **Arkiv and Swarm:** `network_status` and SDK version match the pin; console balance; a write, read, extend and delete probe (optional flag); the Swarm API host accepts a small upload and returns the same bytes; the Hall page loads with the relay unreachable (`--no-relay`).
5. Worker running and not killed; outbox depth; receipts file writable.
6. Public origin reachable over HTTPS if hosted; `/api/web3/health` returns `ok`.

## 5. Hosting the branch

The branch is deployed as a **separate staging service** (not the service serving `main`). Requirements: public HTTPS and `PUBLIC_ORIGIN` set to it (phones on cellular cannot reach a laptop on a LAN; the socket origin check accepts only same-host origins or `PUBLIC_ORIGIN`, so a separate web3 frontend origin would be rejected); a **writable volume** for `WEB3_DATA_DIR` shared by the relay and the worker (the container image is ephemeral); the worker as a **second process or service** with its own env file; the relay's `trust proxy` is `loopback` only, so run behind a TLS-terminating proxy on the same host; the Dockerfile sets `HTTP=1`, `NO_OPEN=1` and `PORT=8080` and runs as `USER node`. **The pot console is served by the relay at `/pot/`** (built into `integrations/arc/pot-console/dist`; the image must include it and `.dockerignore` must not exclude it). Express has no body parser: the web3 router adds its own `express.json({limit: "16kb"})`. New server files change `BUILD_ID` (open pages are told to reload on the next join): **do not deploy mid-demo.**

**The booth and the LAN fallback run `PARTNERS=mock`** automatically when there is no internet, with a visible notice.

## 6. Operating the worker and the kill switch

Logs are structured and never contain keys, tokens or full addresses. The Chain window's host-only section shows: worker heartbeat (the worker writes a heartbeat line every 5 s), outbox depth, last receipt time, relayer and registrar balances (rounded). **Kill switch:** set `WEB3_KILL=1` or create the `KILL` file; sending stops within one poll; remove it to resume (jobs resume from the outbox). **Restart safety:** idempotency keys and the done-set make a restart or a duplicate a no-op. **Spend caps** stop a runaway loop; an alert line is logged when a balance falls under its floor.

## 7. Windows and developer notes

The working tree is CRLF on Windows (`core.autocrlf=true`); `bundleHash` hashes raw bytes, so **do not compare hashes across machines with different line endings**; scripts that rewrite `plan.md` or `plan-history.md` must preserve CRLF (the docs under `docs/plans/web3/` are LF). `npm run check` fails on Windows at `catalog:check` (CRLF drift) and one symlink test; record the baseline in S0. Install Foundry (`forge`, `anvil`) for the contract and fork tests; install `@circle-fin/arc-studio-cli` globally (Node 20 or later) for the Arc lane. The `ens-cli` is experimental and installed from a `pkg.pr.new` URL: **its `resolver deploy` can default to the zero address, never broadcast that**.

## 8. Play money, labels and the safety defaults

The build has **no real-value mode**: testnets and no-value tokens only; the config loader refuses mainnet chain ids unless explicitly overridden; every staked surface carries the **PLAY MONEY** label; the README and the demo say "play money today, enabled only where lawful later". (The owner has stated that legal and eligibility matters are handled; these are design defaults, not open items.)

## 9. CI on the branch

Extend the existing workflow (it runs `npm ci && npm run check && npm run format:check` on pull requests and pushes to `main` or `codex/**`): add `web3/**` to the push filter; add `npm run web3:test`; add an **optional** contract job (`forge test`, with caching) that does not need secrets; **no secrets in CI**. Live-testnet scripts are manual.
