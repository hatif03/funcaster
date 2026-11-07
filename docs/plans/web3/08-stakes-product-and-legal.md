# Web3 plan 08: friend stakes (real-life betting), the product, and the legal gate

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. **Owner decision (6 November): the product gets real-life betting among friends.** This reverses the earlier "stakes held" position in `plan-history.md` section 13 and the "no real-money flows" line in [business-plan.md](../../../business-plan.md); both are updated to point here. Nothing is built. **This is not legal advice**; section 6 says what the research found and what must be checked with counsel before any real money moves.

## 1. What "betting among friends" is, in product terms

A party night already has a loser and a winner. Stakes let the group put something on the result *before* the match, and settle it *without an argument after*. Three rungs (the ladder from `plan-history.md` section 13, now all wanted):

| Rung | Name | What is staked | Settlement | Needs a chain? | Where it is on by default |
| --- | --- | --- | --- | --- | --- |
| **S0** | **Dare** | A real-life forfeit chosen from presets or short text ("loser buys chai", "winner picks the playlist") | The group's phones co-sign the terms before the match; the result decides who owes what; **settled in person** | No (signatures only; a receipt can be stored) | Everywhere, with a safe preset list |
| **S1** | **Standing** | Bragging rights: head-to-head record, streak, season rank | Computed from verified results | No | Everywhere |
| **S2** | **Pot** | Stablecoin put into a shared escrow by every seat before the match | A contract pays the winners from the result; refunds if the match is abandoned or contested | Yes ([09](09-arc-pot-and-settlement-plan.md)) | **Off.** On at the event on **testnet with no-value tokens**; real value only where lawful (section 6) |

The Lobby's **Ranked** and **Dare terms** options (standing owner decision: always visible, disabled with a reason when unavailable) become the entry point; a **Stakes** row is added beside them with the same rule.

## 2. The rules of a stake (so no argument is possible)

1. **Equal stakes, fixed before the match, chosen by the host and accepted by every seat.** Nobody can be pulled into a stake they did not sign.
2. **Humans only.** Every staked seat must be a verified distinct human (World, [04](04-world-plan.md)); a guest or an agent seat can play the room but cannot hold a stake. This is the anti-collusion rule: one person controlling two seats is how a friendly pot gets farmed.
3. **A staked match needs the minimum humans from start to finish.** If a seat leaves, the match is `abandoned` and the pot refunds; there is no walkover win (the existing `abandoned` flag in `plan-history.md` sections 8 and 14).
4. **The result is the platform's canonical, replay-verified result** (`server/records.cjs`, `verification: replay-verified`). A result that is not verified cannot settle a pot.
5. **Payout rule is fixed at creation:** winner takes all, top two split 70/30, or equal split among tied winners; recorded in the signed terms.
6. **No rake, no fee, no house position in v1.** The platform never holds funds and never takes a cut (a cut makes the operator a gambling operator under any regime; section 6).
7. **Contested means refund.** Any seat can flag the result during the challenge window; a contested pot returns every stake. No admin can override it.
8. **Refund is permissionless.** If nothing settles by the deadline, any seat (or anyone) can trigger the refund. If Funcaster disappears, nobody's money is stuck.
9. **Adults only for S2** (an 18+ confirmation; World ID does not prove age), and S0 presets avoid money-equivalents.

## 3. The flow (one match, S2)

1. **Setup (host phone or Game Properties).** Game, seats (2 to 4), stake (a preset such as 1, 5, 10 test-USDC), payout rule, funding deadline. The room shows **STAKES: PLAY MONEY** (testnet) or the real label.
2. **Join and verify.** Each seat joins by QR, verifies as a human (World), and sees the terms on the phone: a plain card with the stake, the payout rule, "what happens if someone leaves", and **Accept**.
3. **Fund.** Each accepted seat funds its stake into the pot contract. At the event the phone's session key is topped up with testnet USDC by the sponsor wallet on join (no wallet app needed); for real value the player connects their own wallet. The Players window shows funded seats as lit collar tags on Chonk (the mascot's four seat tags).
4. **Lock.** When every seat has funded, the pot locks and the match may start. **The match cannot start until the pot is locked** (when stakes are on).
5. **Play.** Unchanged. The games know nothing about stakes (the hook is `match.finish`; no game file changes).
6. **Settle.** The relay builds the canonical result and the **payout vector**. Two paths ([09](09-arc-pot-and-settlement-plan.md) section 4): the **cooperative path** (every seat's phone signs the same EIP-712 payout message; the contract pays at once) and the **oracle path** (a signed report from the result oracle, then a challenge window). Anything else (abandon, dispute, timeout) refunds.
7. **Receipt.** The Results window shows the pot outcome and the transaction link, and the receipt is stored ([05](05-arkiv-plan.md)): "asha beat ravi at Golf, pot 10 test-USDC, settled".

## 4. What changes in the code base (all additive, outside the hashed trees)

| Piece | Where | Note |
| --- | --- | --- |
| Settlement capability becomes active | `server/integrations.cjs` (new, [02](02-integration-architecture.md)) | `open(terms)`, `fund(seat)`, `lockStatus()`, `settle(result)`, `refund()` |
| Stakes state on a room | `server/party.cjs` | `room.stakes = { rung, terms, potId, status }`; `start` is refused while `status` is not `locked` |
| Payout calculation | `server/stakes.cjs` (new) | Pure function from the canonical result and the payout rule to the payout vector; unit-tested; ties and abandons covered |
| Terms signing | `public/party/phone.js` (consent card) | Same session-key signer as the other partner features |
| UI | Funcaster Game Properties, Players, Results; phone terms card | All hidden when `PARTNERS=off` except the disabled Stakes row |
| Contracts and oracle | `integrations/arc-pot/` | [09](09-arc-pot-and-settlement-plan.md) |

## 5. Business-plan alignment (what this does to `business-plan.md`)

- **It reverses a line.** The business plan lists "real-money flows" as *what not to build yet*, and its risk table says "no real-money prizes". The owner's 6 November decision overrides that for the hackathon build and for the product direction; the business plan now carries a section on stakes ([business-plan.md](../../../business-plan.md) section 11) with the constraints below.
- **No revenue from the pot.** The business plan's models (host subscription, packs, creator take rate, sponsorship) stay the revenue; stakes are a **retention and fun mechanic**, not a monetisation model. There is deliberately no rake (rule 6).
- **Platform rules still apply.** Twitch's Extensions policy prohibits wagering, pay-to-play and items of monetary value (business plan section 6). **Stakes never appear in an OBS overlay or any stream-linked surface.** The community-arcade direction (streamers) stays coin-free; stakes belong to private friend rooms.
- **The "no real-money prizes" abuse control** in the business plan's risk table is replaced by: stakes are friend-room only, 18+, region-gated, no public rooms, no matchmaking with strangers.

## 6. The legal gate (background; the owner confirmed on 6 November that legal matters are handled, so these are design defaults, not open items)

What the research on 6 November found, from legal commentary (secondary sources, not the Gazette text; the later 2026 Rules need reading in full):

- **India: the Promotion and Regulation of Online Gaming Act, 2025** (presidential 6 November 2025) **bans online money games**: games played by paying fees, depositing money or **other stakes** in expectation of winning, **whether skill, chance or both**. Commentary says credits, coins and tokens, real or virtual, count as "other stakes". Offering or facilitating one carries **up to three years' imprisonment and a fine of up to ₹1 crore**, advertising up to two years and ₹50 lakh; offences are described as cognisable and non-bailable, and companies and their officers are liable. Players are described as victims, not offenders. One source reports the Act and the *Promotion and Regulation of Online Gaming Rules, 2026* **came into force on 6 November 2026** (verify against the Gazette). Sources: [SCC Online](https://www.scconline.com/blog/post/2025/08/24/promotion-regulation-online-gaming-act-2025-legal-reform/), [Mondaq analysis of the Act and 2026 Rules](https://www.mondaq.com/india/gaming/1784444/indias-new-online-gaming-framework-analysis-of-the-2025-act-and-2026-rules), [Lexology](https://www.lexology.com/library/detail.aspx?g=31a466da-49b3-40b5-9767-2ff42367d307).
- **What the research did not find:** any statement on **private bets between friends** or on **non-custodial smart-contract escrow**. On the face of the definition, the counterparty being a friend does not obviously exempt it. Treat this as **unresolved and probably adverse** until counsel says otherwise.
- **Consequence.** A real-value pot, run by a company in Mumbai and shown at Devcon, is the highest-risk thing in this entire plan. It is a **legal risk to the people, not a technical risk**, and it is not one to accept by default.

**Decisions taken (so work can proceed; owner may overrule):**

| # | Decision | Why |
| --- | --- | --- |
| L1 | **At the hackathon and the booth, S2 runs only on a testnet with no-value tokens**, labelled "PLAY MONEY: no cash value, cannot be redeemed", with nothing to win beyond the token | Hackathon judging does not need real value; it removes the main exposure |
| L2 | **Real-value S2 is off by default in every build** and is enabled only by explicit server configuration per region; **it is never enabled for users in India** without a written legal opinion (and registration if the regulator requires it) | The Act's reach |
| L3 | **No rake, no sale of tokens, no promotion of winnings**, no public or stranger rooms, no stream surfaces | Keeps the platform out of "operator" and "advertiser" |
| L4 | **S0 dares are safe presets by default** (no money-equivalents) and **S1 standing involves no stake at all** | The always-available layers stay lawful |
| L5 | **Legal opinion and counsel**: handled by the owner (6 November); not tracked here | n/a |
| L6 | **ETHGlobal conduct terms**: handled by the owner (6 November) | n/a |

The honest pitch line for judges, partners and press is therefore: *"Stakes are built and work end to end; at events they run as play money; real value is enabled only where it is lawful."* That is both true and the safest framing.

## 7. What to build, in order (marginal hours; see [07](07-schedule-prep-risks.md) for the schedule)

| Tier | Work | Hours |
| --- | --- | --- |
| **1** | S0 dare terms, co-signing and receipt (no chain; the signing and consent card are shared with other features) | 6 |
| **1** | S1 head-to-head and streak from results (already close to the event store) | 4 |
| **2** | Stakes state, payout function, lock-before-start rule, UI surfaces, mock Settlement provider (a local pot that behaves like the contract) | 14 |
| **3** | The pot contract, funding and settlement on the chain ([09](09-arc-pot-and-settlement-plan.md)) | 20 to 26 |
| **3** | The oracle path ([09](09-arc-pot-and-settlement-plan.md) section 4) | 9 to 11 |
| | Legal switches and labels (region gate, play-money labels, 18+ card) | 3 |

Tiers 1 and 2 are worth doing even if no money ever moves: they are the "betting feel" the earlier plan identified, and they work with the mock provider on the LAN.

## 8. Tests

Payout function (ties, abandon, one winner, 70/30, rounding to the smallest unit with the remainder rule fixed); lock-before-start; an abandoned staked match refunds; a contested result refunds; an unverified result cannot settle; a guest or agent seat cannot stake; double-settle and double-refund are rejected; the region gate refuses real-value mode; the play-money label is present on every staked surface; replay of the same result gives the same payout vector on server and in the contract test.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **Legal exposure in India** | Section 6: testnet only at events, off by default, counsel 6 November, no rake, no public rooms |
| Wallet and funding friction on phones | Session-key funding with a faucet drip at the event; real wallets only for real value; the pot can be pre-funded before game night |
| A staked match with a flaky seat (disconnects) | The `abandoned` rule and permissionless refund; the lock-before-start rule |
| Collusion (one human, several seats) | The humans-only rule (World); the seat count limit; no strangers in staked rooms |
| A bug in the contract loses funds | Testnet only at the event; the contract has no admin and no upgrade path; the refund path is the default; audit before any real value |
| Stakes spoil the party mood | The Stakes row is opt-in per match; S0 and S1 remain the default |
