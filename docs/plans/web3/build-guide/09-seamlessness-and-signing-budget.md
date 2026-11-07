# Build guide 09: do ENS, Arc and Arkiv work seamlessly together? The signing budget

Part of the [build guide](00-README.md). Status: plan, 6 November 2026. **No code is written; this is an analysis of the design in [01](01-architecture.md) to [04](04-arkiv-guide.md), plus the corrections it produced** (applied to those documents). The question: will a user have to sign several transactions or messages to get one thing done?

## 1. The short answer

**By design, no wallet prompt ever appears and the user never pays gas, but only because of one decision: every phone carries a silent session key that signs for it.** That decision is acceptable only because the build is **play money**; a real-money version would need real wallet prompts (and the ENS, Arc and Arkiv flows would then need rethinking). Within that frame the three partners are not three systems to the user; they are one identity (the phone's key) seen through three ledgers:

| One key, three roles | ENS (Sepolia) | Arc (testnet) | Arkiv (Tiramisu) |
| --- | --- | --- | --- |
| The key is | the **owner** of the seat's name | the **seat address** that stakes, signs and is paid | the **owner of the winner's trophy** entity and, if the player opts in, of their **profile** (the only Arkiv step the phone signs itself) |
| The user sees | their nickname with a check | "Put in my stake", "You won 3.00" | a leaderboard row, a recap card, a trophy, "My history" |
| The user does | nothing | one tap to stake; nothing to be paid | nothing; one tap on **Keep my profile**; one tap to **edit or delete** it |

**Naive version, for contrast** (what the same journey costs if each partner is used the usual way): connect a wallet (1 prompt), switch networks to Sepolia (1), register or claim a name (1 transaction), switch to Arc (1), approve USDC (1 transaction), deposit into the pot (1 transaction), sign the result (1), claim the payout (1 transaction), plus gas in two different tokens: **about 8 prompts across 3 networks and 2 gas tokens**. Our design: **one tap**.

## 2. The signing budget, journey by journey

"Taps" are deliberate user gestures. "Silent signatures" are made by the phone's session key without a prompt. "Worker transactions" are sent and paid for by the worker (the user never sees them). "User-paid transactions" must always be **0**.

| Journey | New taps (beyond today's flow) | Silent signatures | Worker transactions (chain) | User-paid transactions |
| --- | --- | --- | --- | --- |
| **Join a party and play** (no stakes) | **0** (today: scan, nickname, "Tap to start") | 1 `Bind` | seat mint (ENS, async), first-time play-money drip (Arc) | 0 |
| **Host starts the party** | 0 | 0 | party open (ENS), host role grants (ENS), all async | 0 |
| **Join by name** | 0 (types a name instead of a code) | as above | 0 | 0 |
| **Stake in a pot** | **1** ("Put in my stake") | 2 (`Accept`, funding authorization) | create (Arc), one fund per seat (Arc), lock | 0 |
| **Result and payout** | **0** in the normal case (an optimistic 5-second "Agreeing…" with a **Dispute** button, section 3) | 1 `Settle` (automatic) | settle (Arc), one claim per seat (Arc), receipts (ENS records, Arkiv) | 0 |
| **Dispute** | 1 | 1 `Contest` | contest (Arc), refunds | 0 |
| **Spectator prediction** ([10](10-prediction-market.md)) | **3** (pick outcome, pick amount, "Place prediction") | 1 (bet authorization) | bet (Arc), auto-claim | 0 |
| **Receipts and trophy** | 0 | 0 | ENS record, Swarm upload (replay and recap card), Arkiv result, scores, receipt, trophy transfer | 0 |
| **Keep my profile** (opt-in, Arkiv) | **1** | 0 | create and transfer to the phone's key, a small GLM drip (all the worker's) | 0 |
| **Edit or delete my profile** | **1** | **1 Arkiv transaction signed by the phone's own key, with the dripped GLM** (a lazily loaded bundle, only on that screen; not a wallet prompt) | 0 | **0 (the GLM is the worker's)** |
| **Open the Hall, My history, Live now** | 0 | 0 | 0 (browsers read Arkiv directly; no relay needed) | 0 |

So the whole evening for a player costs **zero prompts and one tap per staked match**; a spectator costs three taps per prediction. Everything chain-shaped is behind the scenes, in the worker, and visible only in the Chain window and the explorers (for judges).

## 3. Where the first version of the plan still asked too much, and the fixes

| # | Problem found | Fix (applied to the guides) |
| --- | --- | --- |
| F1 | The settle card in [03](03-arc-guide.md) and [05](05-ui-integration.md) asked **every player to tap "Agree" after every staked match**: an avoidable extra tap, and the likeliest place for a friend to stall the table | **Optimistic auto-agree.** The phone receives the placing and the result hash, checks it matches the scores it displays, shows "Agreeing in 5…" with a **Dispute** button, and signs `Settle` silently when the countdown ends. Zero taps in the normal case; one tap only to dispute. If any seat has not signed within 60 s, the oracle path proposes (as before) |
| F2 | The pot roster is built by resolving **ENS names**, but ENS naming is the slowest step (Sepolia blocks are about 12 s) and the pot should lock quickly | The roster uses ENS **when the names exist** and **falls back to the bound session addresses** when they do not; the two always agree because **the seat name's `addr` record is the session key's address** (new: the worker sets `addr` in the same `multicall` as the seat records, [02](02-ens-guide.md) section 5). So ENS is the roster source of truth without ever blocking a stake |
| F3 | The play-money **drip happens on the first staked match**, adding a visible wait at the worst moment | Drip a small starting bankroll **on first join** to any web3 room (capped per device and per IP), in the background; the stake card then never waits. Refill only below a threshold (rules in [10](10-prediction-market.md) section 9) |
| F4 | The **faucet limit** (20 USDC per address per 2 hours behind a reCAPTCHA) makes a large bankroll impossible to script | Tiny stakes (0.05 to 1.00), small bankrolls (1.00 to 2.00 per device), winnings recycle to keys, and an optional **play token** instance of the market contracts for volume ([10](10-prediction-market.md) section 9) |
| F5 | The phone's key lives in `localStorage`; **private browsing, evicted storage or a new phone creates a new identity** (no names, no history) | Acceptable for play money; the phone shows "Your player key lives in this browser"; an in-memory fallback keeps the session working when storage is blocked; the seat name is per party anyway |
| F6 | Three chains means three possible outages | Every flow has a defined degradation ([01](01-architecture.md) section 10): ENS down means addresses instead of names and a labelled `soft` host check; Arc down means stakes and predictions are disabled with a plain reason; Arkiv down means the local leaderboard (labelled) and only this console's live matches; Swarm down means "replay not published" and nothing else |
| F7 | The three partners could **disagree about who someone is** | One `Bind` per seat connects the seat to one address; the same address is the ENS owner, the pot seat and the Arkiv trophy owner; a rebind (new token) revokes the old binding on the relay and the next mint or stake uses the new one |

## 4. Cross-partner consistency rules (so they behave as one system)

1. **One address per seat per party**, set by `Bind`, used by ENS (owner and `addr`), Arc (seat) and Arkiv (trophy). The spectator key is the same mechanism with no seat.
2. **One source of "who is here"**: the relay's bound seats; ENS records follow it (never the other way round for gameplay), while ENS is authoritative for **host power** and, when present, **roster names**.
3. **One result hash** (the relay's canonical `hash`) written to Arc (as `resultHash`), ENS (the `chonks.receipt` record) and Arkiv (the `result` entity's `result_hash`), with the **replay's hash and its Swarm reference** beside it in Arkiv, so a judge can follow a match across all three explorers and re-verify it from Arkiv and Swarm alone. **The ENS party name is also an Arkiv attribute** (`party`; **historical text only, because the party name is unregistered when the party ends**, [02](02-ens-guide.md) section 7; the permanent pointers are the handle, the entity key and the transaction logs), and the result hash in the ENS `chonks.receipt` record is an Arkiv attribute (`result_hash`), so a name leads to its Arkiv records and a record leads back to its name with no extra transaction (no entity key is written to ENS: it is only known after the Arkiv write).
4. **One status model** in the UI: `saving` (waiting for a receipt), `saved`, `local` (outbox pending), per receipt, per partner.
5. **No cross-partner blocking**: an ENS failure never stops a pot, an Arc failure never stops naming, an Arkiv failure never stops either.

## 5. Latency budget (Sepolia about 12 s per block; Arc under 1 s; Arkiv about 2 s) [inference; measure in the spikes]

| Step | Expected | User sees |
| --- | --- | --- |
| Seat joins and plays | instant | the nickname |
| Party name appears (warm pool, one register transaction) | about 12 to 25 s | a balloon "Party name ready" |
| A seat's name appears | about 12 to 25 s each (sequential nonces) | the check appears |
| Stake accepted to locked | about 1 to 3 s after the last accept | the lock balloon and Start enabling |
| Result to paid | about 6 s (5 s auto-agree plus under 1 s settle and claims) | "Paid out" |
| Receipt in Arkiv and ENS | about 5 to 30 s | the receipt lines turn "Saved" |

## 6. What was corrected in the other guides

[01](01-architecture.md) flow E (auto-agree), [02](02-ens-guide.md) section 5 (the `addr` record and the roster rule), [03](03-arc-guide.md) section 6 (settle step) and the drip timing, [05](05-ui-integration.md) section 4.3 (the settle card becomes a countdown with a Dispute button), [06](06-tasks-and-codex-prompts.md) (tasks for the auto-agree flow and the first-join drip).
