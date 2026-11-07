# Build guide 17: every way the platform may be used, and what happens (so nothing is unexpected)

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written.** The scenarios of [13](13-users-scenarios-and-accounts.md) follow the main journeys; this document **ideates the rest**: it lists the dimensions along which use can vary, the surfaces and devices (including a **spectator on a laptop**), and then a catalogue of about 120 situations with the expected behaviour and where it is specified, so the build team and the tests do not meet a surprise on the booth floor. Where a situation reveals a **new rule**, it is marked **RULE** and has been (or must be) folded into the guide.

## 1. The dimensions of variation

| Dimension | Values to consider |
| --- | --- |
| **Who** | Host, seated player, queue player, spectator, remote friend, operator, judge, creator, adversary ([13](13-users-scenarios-and-accounts.md)) |
| **Device** | Phone (iOS Safari, Android Chrome, in-app browsers), tablet, laptop, desktop monitor, TV browser (the shell), smart-TV built-in browser, kiosk tablet, OBS browser source |
| **Input** | Touch, mouse, keyboard only, D-pad and the phone cursor (TV), screen reader, voice |
| **Network** | Venue Wi-Fi (congested, client-isolated, captive portal), cellular, hotel Wi-Fi, offline, high latency, the LAN fallback |
| **Place and crowd** | A living room, a booth with hundreds, a conference hall, a classroom, a remote call |
| **Time** | Start of the day, the last seconds before close, overnight, across time zones, a long-running session |
| **Identity state** | No key, a fresh key, a verified human, named, a cleared browser, two devices, a shared device |
| **Money state** | Full bankroll, empty, two assets, a pending authorization, a refund due, a faucet dry |
| **Match state** | Lineup unfixed, locked, betting open, closed, live, resolving, void, abandoned |
| **Chain state** | All healthy, one chain slow or down, the worker down, the indexer behind, a reorg, a faucet or RPC rate limit |
| **Intent** | Honest, careless, curious, confused, hostile |

## 2. The surfaces and what each can do

| Surface | Motion sensors | Persistent key | Money actions | Notes |
| --- | --- | --- | --- | --- |
| **Phone browser** (Safari, Chrome) | yes (HTTPS) | yes (Safari may evict script storage after about 7 days without a visit: nudge "Add to Home Screen") | yes | The main surface |
| **In-app browsers** (WhatsApp, Instagram, Telegram, X, Facebook) | often blocked | **separate storage from the normal browser: a different account** | yes | Detect by user agent; show "Open in your browser to keep your history" |
| **Tablet** | maybe | yes | yes | Two-column layout (section 3 of [11](11-prediction-market-ui.md) addendum) |
| **Laptop or desktop browser** | no (not needed) | yes (per browser profile) | yes | The **spectator laptop**: predictions, Ledger, boards; a wide layout with keyboard and mouse |
| **The TV shell** (Funcaster) | n/a | the shell has **no money key**; it can optionally bind a **host account** | **never initiates money actions** | Shows aggregates; a QR for everything personal |
| **Smart-TV built-in browser** | no | uncertain | n/a | Treat as a display only (Leaderboard, Predictions board, Ledger read-only); the shell needs a modern browser (laptop or stick) |
| **Kiosk tablet** (a staffed "Predict station") | no | **session-only by design** | yes | Section 6 |
| **OBS browser source** (a streamer overlay, later) | no | none | none | A read-only overlay page of odds and results |

## 3. The laptop spectator (the case the owner raised)

A person at a desk or on a sofa with a laptop opens the **`/me`** page (a link, a QR scanned with a phone and sent over, a pasted deep link) and predicts with a mouse and keyboard, perhaps while watching the match on the TV, a stream, or the Predictions window. What this requires:

- **The account app has a wide layout** (three columns: filters and match list, the selected market, the bet slip as a **side panel** instead of a bottom sheet; plus a My Predictions rail) with **mouse hover states, a visible focus ring, full keyboard control** (J and K move through matches, 1 to 4 pick an outcome, the chips with the plus and minus keys, Enter confirms after the arming delay, Escape closes, `?` shows help), and the same eight states and copy as the phone. Specified in the addendum to [11](11-prediction-market-ui.md).
- **Nothing needs a sensor or a camera**; the laptop key is created silently like on a phone and signs silently.
- **Tab title and favicon show the countdown** ("0:42 Star Catch"), and an opt-in **desktop notification** announces "closing in 30 s" and the result (the browser's Notification permission is asked only when the user enables it).
- **Multiple tabs share one key** (same origin): a `BroadcastChannel` keeps balance and bets in sync; two tabs placing a prediction at once is safe (each bet has its own salt and nonce).
- **Share a market**: a **Copy link** button produces `/me?m=<publicMarketId>`; opened on any device it lands on that market (after the first-visit card).
- **Laptop plugged into the TV** (the same laptop is the shell host and a spectator in another tab): the shell host is **not** a signer, but the spectator tab's key is; **RULE:** the room's **host account** (if the host binds one in the shell) and **staff** addresses are **barred from predicting on that room's markets** (the host controls start timing and lineup; the close and the seed commit limit the harm but the bar closes the conflict). If the host has not bound an account the bar cannot be enforced and the README states the residual risk.
- **A laptop and a phone for the same person**: link them ([13](13-users-scenarios-and-accounts.md) section 2) or accept two accounts; a seat key on the phone and a spectator key on the laptop are **different addresses**: the **device-correlation signal** and a **same-human check (nullifier)** catch an L2 human trying to predict on their own match from the other device (F10); an unverified person doing it is caught only by the weaker signals (residual risk, stated).

## 4. The catalogue

Format: **situation, expected behaviour, where specified or tested**. "Spec" refers to the guide document and section; "Test" to the scenario or detector tests.

### A. Access and device

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| A1 | A spectator opens `/me` on a laptop | Wide layout; keyboard and mouse; same states and copy | Section 3; [11](11-prediction-market-ui.md) addendum |
| A2 | A link is opened inside WhatsApp or Instagram | A banner: "Open in your browser to keep your history"; works meanwhile with a separate account | Section 2 |
| A3 | iPhone Safari evicts storage after about 7 days idle | A new key on return; the Wallet tab explains; "Add to Home Screen" suggested; history lives on chain and is recoverable for L2 | [13](13-users-scenarios-and-accounts.md) section 2 |
| A4 | Private or incognito tab | The key is memory-only; banner "this session only"; nothing persists | [11](11-prediction-market-ui.md) section 6.1 |
| A5 | The browser blocks storage entirely | Same as A4; a clear message; money actions still work for the session | A4 |
| A6 | The page is opened on a smart-TV browser | Read-only boards (no money actions) | Section 2 |
| A7 | Very small phone (320 px) or a very large monitor | Responsive breakpoints; the slip never overflows; maximum content width on large screens | [11](11-prediction-market-ui.md) addendum |
| A8 | Landscape phone | The slip becomes a side panel | Addendum |
| A9 | Two tabs open on the same key | State synced; no duplicate bets | Section 3 |
| A10 | The same person on a phone and a laptop | Two accounts unless linked; same-human checks cover the rest | Section 3 |
| A11 | A shared family laptop | "Not you? Switch profile" creates a fresh guest key; the previous key stays in its own profile slot | Section 6 |
| A12 | A staffed prediction station tablet | Station mode: session-only, auto-reset after 2 minutes idle | Section 6 |
| A13 | A browser extension blocks scripts or sockets | A diagnostic page explains what failed; the TV still works | [11](11-prediction-market-ui.md) |
| A14 | Screen reader or keyboard-only use | Labels, live regions, focus order, no mouse-only controls | [11](11-prediction-market-ui.md) section 7 |
| A15 | Colour blindness | Letters and shapes with colour; never colour alone | [11](11-prediction-market-ui.md) section 1 rule 7 |
| A16 | Reduced motion | No animation needed for meaning | [11](11-prediction-market-ui.md) section 7 |
| A17 | Another language or script (Hindi, Marathi, RTL) | Strings are in a table; names in any script; layout survives long strings | [11](11-prediction-market-ui.md) section 7 |
| A18 | A person opens the page on an old phone | Graceful failure: a message and the TV still shows everything; no half-working money actions | **RULE:** a feature check at load; if signing is unsupported the page is read-only |

### B. Identity and account

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| B1 | First ever visit | Silent key; starting bankroll; first-visit card | [11](11-prediction-market-ui.md) section 6.1 |
| B2 | The person clears browser data | A new key; on-chain history stays; L2 can recover | [13](13-users-scenarios-and-accounts.md) |
| B3 | Two accounts claim the same verification | Refused (nullifier) | [13](13-users-scenarios-and-accounts.md) S7 |
| B4 | Verification is unavailable | Stay L1; the UI says why; boards need L2 | S7 |
| B5 | A handle is offensive or impersonates | Filter at claim; the handle can be moderated; an ENS hall-of-fame name needs the filter too | [13](13-users-scenarios-and-accounts.md) |
| B6 | Two people pick the same nickname in a party | Suffix (`asha-2`); ENS label collision handled | [02](02-ens-guide.md) section 4 |
| B7 | A nickname is empty, huge, all emoji or RTL | Sanitised to a legal label for ENS; the display name keeps the original within length limits | [01](01-architecture.md) section 7.2 |
| B8 | A person changes their nickname mid-party | The display name changes at once; the ENS seat name stays (labels are fixed per mint); a new party mints a new one | [02](02-ens-guide.md) |
| B9 | A device-linking QR is photographed by someone | The secret is in the URL fragment and the ciphertext expires in 2 minutes and works once; the old phone must confirm | [13](13-users-scenarios-and-accounts.md) section 2 |
| B10 | Lost phone, no verification | The account is gone (play money); stated plainly | [13](13-users-scenarios-and-accounts.md) |
| B11 | A staff member's phone is also a normal account | Staff addresses are flagged and excluded from boards and markets | [15](15-integrity-and-anti-cheat.md) section 7 |
| B12 | A child uses the platform | Play money only; no personal data collected beyond a nickname; no real-money mode exists | [08](08-config-and-ops.md) section 8 |

### C. Money and wallets

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| C1 | A spectator has no coins | The refill rule or "ask staff for a top-up" | [13](13-users-scenarios-and-accounts.md) S19 |
| C2 | The bankroll faucet is dry | A banner "Predictions are paused: coins are being topped up"; staff alerted; the TV unaffected | [10](10-prediction-market.md) section 9 |
| C3 | A seat has USDC but the room uses EURC | The slip says "You have 0.00 play euros; get some"; a **swap-free** rule: no conversion; the refill gives the room's asset | [16](16-arc-native-features.md) |
| C4 | A pot is accepted by two of three seats and the third times out | The attempt cancels; the funded seats refund (permissionless) | [03](03-arc-guide.md) |
| C5 | A bet authorization expires before the relayer submits it | Nothing happens; the coins were never taken; the UI shows "Not placed" | [11](11-prediction-market-ui.md) section 6.3 |
| C6 | A person taps Predict twice | The second is refused (same nonce) or becomes a second bet only if the user opens a new slip; one confirm per slip | [11](11-prediction-market-ui.md) |
| C7 | The relayer is out of gas funds | Bets are refused with "temporarily unavailable"; a second relayer takes over; an alert | [10](10-prediction-market.md) section 8 |
| C8 | A winner's address is blocklisted on Arc | Their claim reverts; **other claims are unaffected**; the Ledger shows the failed claim; no loop to block | [03](03-arc-guide.md), [10](10-prediction-market.md) |
| C9 | A person wants their coins back | A pot or a bet is refundable only per the rules (before close for Undo if built; refunds on void; otherwise final) | [11](11-prediction-market-ui.md) |
| C10 | A claim fails mid-way | The worker retries; the claim is permissionless and idempotent; the Ledger shows pending | [12](12-reality-and-ledger.md) |
| C11 | A user asks "where did my coins go" | Activity tab and the Ledger: every row with its badge and Verify | [12](12-reality-and-ledger.md) |
| C12 | Funds arrive by an unexpected path (someone sends coins to a seat key) | Allowed (it is their key); the Wallet shows the balance; markets never depend on `balanceOf` | [10](10-prediction-market.md) |
| C13 | A user holds both assets | The Wallet shows both; the slip uses the market's asset | [13](13-users-scenarios-and-accounts.md) |
| C14 | A tiny balance (dust) | The minimum bet check says "under the minimum 0.05" | [10](10-prediction-market.md) |

### D. Lineup and match

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| D1 | A seat leaves during the betting window | The market voids; a new window opens; refunds | [10](10-prediction-market.md) section 4 |
| D2 | A seat leaves after the match starts | Forfeit; markets void; a staked pot is `abandoned` and refunds | [13](13-users-scenarios-and-accounts.md) S8 |
| D3 | The host ends the room mid-match | Markets void; pots refund; the Ledger shows it | [13](13-users-scenarios-and-accounts.md) S10 |
| D4 | The game is co-op Slice Dojo | No Winner market (everyone ties); a Beat-the-line market is allowed | [10](10-prediction-market.md) section 3.3 |
| D5 | The game is Drawing | Not eligible (attested) | [10](10-prediction-market.md) section 3.1 |
| D6 | Solo versus AI | Beat-the-line only | [10](10-prediction-market.md) |
| D7 | A turn-based long game (Pocket Greens) | Allowed last; the resolve deadline sized to the cap (up to 1800 s) | [10](10-prediction-market.md) |
| D8 | An endless game reaches its cap | DNF counts as "falls short"; the cap defines the end | [10](10-prediction-market.md) |
| D9 | The result fails replay verification | The market voids; the match is excluded | [15](15-integrity-and-anti-cheat.md) F14 |
| D10 | A tie for first | Dead heat split; no void | [10](10-prediction-market.md) section 5.5 |
| D11 | Every seat forfeits or all are DNF | Void | [10](10-prediction-market.md) |
| D12 | A late joiner tries to take a seat after the lineup lock | Refused or queued; the lineup is fixed once the market opens | [10](10-prediction-market.md) section 4 |
| D13 | Two TVs at the booth run matches at once | Both listed (if opted in); the directory shows both; per-room markets | [10](10-prediction-market.md) section 10 |
| D14 | A kiosk match starts with no bettors | The market voids at close (one-sided); the match starts after the 30 s minimum | [10](10-prediction-market.md) |
| D15 | A creator's casual game is played | No markets, no ranked stats | [13](13-users-scenarios-and-accounts.md) S15 |
| D16 | The room code is shared publicly | A public code lets people fill seats: the directory never publishes codes; seat-taking by code remains as today (the existing rate limits) | [10](10-prediction-market.md) section 10 |

### E. Predictions

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| E1 | A tap lands after the close | "Too late. Your coins were not used." | [11](11-prediction-market-ui.md) section 6.3 |
| E2 | The odds move between opening and confirming | The "Odds moved" bar; the bet carries a minimum payout | [11](11-prediction-market-ui.md) |
| E3 | One-sided market | "No opponents yet" while open; auto-void at close if still one-sided; coins returned | [10](10-prediction-market.md) |
| E4 | A seated player opens `/me` | A notice instead of the slip for their own match; other matches are open | [13](13-users-scenarios-and-accounts.md) section 3 |
| E5 | A host predicts on their own room | Barred if their account is bound; otherwise a README-stated residual risk | Section 3 |
| E6 | A spectator hedges (two outcomes) | Allowed; both bets listed; the maximum per address still applies across them | [10](10-prediction-market.md) section 5.2 |
| E7 | The result is "void" | "Match cancelled. You got your coins back." | [11](11-prediction-market-ui.md) |
| E8 | A tie among outcomes | The tie copy; nobody loses coins | [11](11-prediction-market-ui.md) section 3 |
| E9 | Resolution takes longer than 3 seconds | "Checking the result…" with a longer state; the deadline is shown | [11](11-prediction-market-ui.md) |
| E10 | Reporters disagree | The market waits for a third report or the deadline, then voids | [10](10-prediction-market.md) section 6 |
| E11 | A prediction is made on a market that then voids because of a lineup change | Refunded in full | [10](10-prediction-market.md) |
| E12 | A spectator opens an old market link | The final state is shown (result, payout, Verify) | [11](11-prediction-market-ui.md) |
| E13 | A huge pool dominates by one bettor | The per-address and per-pool caps; the whale flag excludes the market from boards | [10](10-prediction-market.md), [15](15-integrity-and-anti-cheat.md) |
| E14 | Someone bets in the last second from a laptop with a slow connection | The on-chain close decides; "Too late" if it arrived late; the authorization expires | [10](10-prediction-market.md) |
| E15 | Many spectators bet at the same moment | The relayer queue and two relayers; throughput planning (section 5) | Section 5 |
| E16 | A spectator watches the TV with latency | Betting closes before the match starts, so latency cannot give information | [10](10-prediction-market.md) section 4 |
| E17 | A user asks to cancel a bet | Optional Undo before close; else final | [11](11-prediction-market-ui.md) |

### F. Network and chains

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| F1 | Venue Wi-Fi isolates clients | Players on the LAN cannot reach each other's phones (the relay is reached directly); spectators on cellular need the hosted origin; the LAN fallback runs `mock` and says so | [08](08-config-and-ops.md) section 5 |
| F2 | A captive portal blocks the page | A diagnostic: "Sign in to the Wi-Fi first" | [11](11-prediction-market-ui.md) |
| F3 | The phone goes offline during a bet | The bet is **not queued** (it is time-critical): "No connection. Your prediction has NOT been placed." | [11](11-prediction-market-ui.md) |
| F4 | The phone goes offline after a bet | The bet stands (it is on chain); the page catches up on return | [12](12-reality-and-ledger.md) |
| F5 | The RPC returns the near-head error | Retry with backoff; the UI shows "confirming" | [12](12-reality-and-ledger.md) |
| F6 | The worker crashes | The outbox grows; restart is idempotent | [08](08-config-and-ops.md) section 6 |
| F7 | The indexer is behind | The Ledger shows a stale banner; balances read from the chain directly | [13](13-users-scenarios-and-accounts.md) S18 |
| F8 | A Sepolia reorg within the confirmation depth | No duplicate rows | [12](12-reality-and-ledger.md) section 7 |
| F9 | Arc is down | Stakes and predictions disabled with the reason; refunds remain possible when it returns | [13](13-users-scenarios-and-accounts.md) S18 |
| F10 | ENS is down | Addresses instead of names; host power marked server-checked | [02](02-ens-guide.md) section 6 |
| F11 | The phone's clock is wrong | Countdowns use server time | [11](11-prediction-market-ui.md) section 8 |
| F12 | The server restarts mid-market | Receipts and chain state rebuild the market view; the on-chain close is unaffected | [01](01-architecture.md) section 9 G |
| F13 | A flood of connections to the market namespace | Rate limits per IP; a cached directory; the TV is unaffected | [10](10-prediction-market.md) section 10 |
| F14 | The explorer is down | The Ledger does not depend on it | [12](12-reality-and-ledger.md) |

### G. Venue and operations

| # | Situation | Expected behaviour | Where |
| --- | --- | --- | --- |
| G1 | Hundreds of visitors at the booth | Caps, queue, directory cache, throughput planning | Section 5 |
| G2 | A fake QR sticker leads to a phishing page | The TV shows the **URL text** beside every QR; the page shows its domain; strict content-security policy; the only signature is typed data for our own domain | **RULE:** show the URL beside the QR |
| G3 | The TV reboots mid-match | Reconnect rules; markets void if the room is gone | [13](13-users-scenarios-and-accounts.md) S10 |
| G4 | The operator leaves the booth | The Kiosk runs itself; the Chain window is staff-only; no operator action is needed | [13](13-users-scenarios-and-accounts.md) S14 |
| G5 | A power cut | Everything is recoverable from the chain; open markets void after the deadline | [10](10-prediction-market.md) |
| G6 | A demo needs a clean slate | A "demo reset" that creates a new season and new keys (never deletes the Ledger) | **RULE:** seasons, not deletions |
| G7 | The booth wants a sponsor's bonus | Bonus per market, shown as "Bonus from <sponsor>" | [10](10-prediction-market.md) section 9 |
| G8 | A visiting judge wants proof | `/ledger`, Verify, replay-check, the reality run | [13](13-users-scenarios-and-accounts.md) S12 |
| G9 | The same booth runs two assets | Separate boards per asset; ROI across assets | [14](14-stats-and-leaderboards.md) |
| G10 | A streamer wants an overlay | The OBS read-only overlay page (later) | Section 2 |

### H. Abuse (details in [15](15-integrity-and-anti-cheat.md))

| # | Situation | Expected behaviour |
| --- | --- | --- |
| H1 | Win-trading, bots, throwing, wash bets, faucet farming | The detectors F1 to F15 and the hard rules |
| H2 | A spectator scripts the directory | Rate limits and caching; nothing sensitive is exposed |
| H3 | Spam markets or rooms | Only the relay creates markets; caps |
| H4 | Someone signs a message the page did not ask for | Signatures are domain-separated (`ChonksPot`, `ChonksMarket`, USDC authorization to our contract only); typed data is readable; a stolen key is play money |
| H5 | A relayer misbehaves | Anyone can submit signed intents; two relayers |
| H6 | A reporter key is compromised | One key cannot resolve or force a void alone |
| H7 | Insider operator | Barred addresses, `ops` rows, hash chain, transparency log |

### I. Support, privacy and the future

| # | Situation | Expected behaviour |
| --- | --- | --- |
| I1 | "Delete my data" | Reset key removes local data; on-chain records are public and pseudonymous (stated in a plain privacy note); the relay's private feature summaries expire |
| I2 | A user reports a bug | A diagnostics page with versions, chain health and the last errors (no secrets) to paste |
| I3 | A new asset or chain is added later | The asset allowlist is a constructor argument (a new deployment); chain ids are configuration |
| I4 | Real-money regions later | A separate deployment and legal review; the build has no real-value mode ([08](08-config-and-ops.md) section 8) |
| I5 | Mainnet ENS later | Chain is configuration ([02](02-ens-guide.md) section 12) |
| I6 | Third-party embeds or an API | The read-only API and the checkpoint make it possible; not built |

## 5. Capacity and throughput (booth scale; measure in rehearsal)

Assumptions [R]: 200 spectators in an hour, 3 predictions each, spread over about 40 matches: about 15 bets per match, about 10 transactions per minute on Arc from the relayers, well within Arc's one-second finality and the 20 gwei floor; the directory is cached for 1 s and serves reads from memory; the `/market` namespace fans out one update per second per market; **per-IP rate limits** (not per-network, because a booth shares one IP behind NAT: use per-key limits for money actions and generous per-IP limits for reads); the relayer uses sequential nonces with a second relayer for headroom and `Multicall3From` batching if needed ([16](16-arc-native-features.md)). **Rehearsal test:** 100 simulated spectators placing bets within a 30 s window must all be accepted or cleanly refused, with no stuck funds.

## 6. Shared devices and the staffed Predict station

For laptops and tablets used by many people (a booth "Predict station"), the account app has **station mode** (`/me?station=1`, enabled by staff with the PIN): each session starts a **fresh guest key** funded by the station's bankroll, shows a **session timer** ("Resetting in 1:30") and **wipes the key and local data after 2 minutes idle** or on **Done**; recovered winnings are **claimed to the key before the reset** (auto-claim) and the person can **send the result to their own phone** by QR (a "Take this with you" card: a deep link to the Ledger rows) instead of keeping a key; large targets for a kiosk; no persistent history on the station. On a family laptop the **Switch profile** control keeps separate keys per profile slot.

## 7. New rules this ideation produced

1. The **host account** (if bound) and **staff** are barred from predicting on that room's markets (section 3).
2. **Feature check at load**: unsupported signing makes the page read-only (A18).
3. **Show the URL text beside every QR** and the page's domain (G2).
4. **Seasons, not deletions** for demo resets (G6).
5. **Bets are never queued offline** (F3).
6. **Station mode** for shared devices (section 6).
7. **Rate limits per key for money actions, per IP only for reads** (section 5).
8. **Open in your browser** banner for in-app browsers (A2).

These are reflected in [05](05-ui-integration.md), [10](10-prediction-market.md), [11](11-prediction-market-ui.md) and [13](13-users-scenarios-and-accounts.md) as noted there; the tests of [07](07-tests-evidence-demo.md) cover the matrix above (each row becomes a scenario test or a detector test, and the Playwright flows run on a phone viewport, a laptop viewport and a tablet viewport).
