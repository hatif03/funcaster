# Build guide 25: the Streamer Network (Twitch, YouTube, Kick), the after-hours arcade and the new income streams (researched 6 November 2026)

**What the owner asked for (6 November 2026):** the same kind of integration as [streamercade.live](https://streamercade.live/), on **Twitch, YouTube and Kick**; a business model in which **game creators, streamers and other parties** all benefit and a **new income stream** opens; and **advanced smart-contract logic used completely inside the app**. This guide is the research, the design, the contracts, the money, the tasks and the guard-rails. It builds on [23](23-creator-platform-and-economy.md) (creator contracts) and [24](24-business-model-and-revenue.md) (the researched revenue model), and it corrects two statements in [business-plan.md](../../../../business-plan.md) section 6 (section 3.3 below).

**Tags.** **[P]** = read in an official page or product page on 6 November 2026 (some by search extract, listed in section 12). **[S]** = secondary source. **[V]** = vendor claim. **[U]** = my assumption, to validate in the pilots (section 10). Rupee figures use ₹95.12 per US dollar. **Nothing here is legal advice.**

## 1. Streamer Arcade (streamercade.live): what it is, from its own page

The page was read in full on 6 November 2026 [P]. The search summary dates its publication to 6 November 2026 [S]. It matches the pitch preserved in [business-plan.md](../../../../business-plan.md) section 1, which that file said "no product literally called Streamer Arcade" yet existed. **It exists now.**

| Topic | What the page says | Why it matters to us |
| --- | --- | --- |
| Core idea | "Stream ends. Arcade opens." Games the community keeps playing through **chat or their phone** after the streamer logs off, with persistent leaderboards, queues and rivalries | The same idea as our layer 3; it validates the demand story, it is not proof of demand |
| How it stays alive | "Your channel still needs an **active broadcast source**": the arcade is a **browser source (1920×1080) in OBS**; games run on their servers; the streamer's PC only displays it | **This answers a gap in our research:** while a stream is live (with the arcade as the scene), chat, Bits, Super Chats and Kicks events still flow. Our earlier "no events while offline" warning applies only to a channel that is **actually offline** |
| Games | **Zen Pond** (build a pond with chat commands), **Tank Duel** (two players, chat votes pick targets), **Skyline** (up to four players, a tower per viewer, high-score board) | Small, chat-first, short rounds; our 13 motion games are a bigger catalogue |
| Controls | Chat commands (`!play`, `!stats`, `!vote B`, `!feed F3`) and **realtime phone controls** that bypass stream delay | Exactly our phone-controller model; the delay handling (chat for slow games, phone for realtime) is the right design |
| Paid events | **Bits, Super Chats and supported tips trigger in-game moments the streamer chooses** (for example 100 Bits plus a command starts a storm); viewers pay through the platform; "**we never process those payments**"; **no cut of Bits, Super Chats or tips** | **They did not build "Bits become coins".** They use **direct triggers**. This is the policy-safe design (section 3.3) |
| Platforms | **Twitch live. YouTube Live beta** (chat commands work; viewers **pair their phone with a short word** instead of a private message; Super Chat in beta). **Kick beta by request** | The same three platforms the owner named. The "pair by short word" trick solves YouTube's lack of whispers |
| Price | "A **one-time implementation fee plus a monthly platform subscription**, quoted for your channel. Custom games are scoped separately" | A **services business**: setup and custom games are hand-built by them, so it scales with their labour |
| Moderation | `!arcade off`, `!arcade skip`, `!arcade game duel`, `!arcade poll` and the same in a dashboard | A baseline we must match |
| Custom games | "Around your mascot, lore, inside jokes", quoted separately | **The scarce input is custom game builders. We have a creator marketplace; they have a team** |
| Not on the page | Prices, traction numbers, a creator marketplace, money rails, physical venues, verified results | Our differentiators (section 2) |

Page facts not found: user numbers, revenue, number of channels (the contact is an email, a Discord and a Twitch channel; `robots.txt` hides `/app` and `/api`, so a dashboard exists) [P].

## 2. The landscape (what streamers pay for, and what it teaches)

| Product | What it does | What the streamer pays | Business lesson | Tag |
| --- | --- | --- | --- | --- |
| **Streamer Arcade** | After-hours chat and phone arcade; custom games | Implementation fee plus monthly subscription (quoted) | Services-led; paid triggers go through the platform; no cut of platform money | [P] |
| **Livecade** (TikTok) | 61 browser-source games driven by comments, gifts, likes, follows, shares | Free (60 minutes a day, watermark) or **Pro $12.99 a month** ($9.61 yearly); an **affiliate program pays 30% of subscriptions for 12 months** | Freemium with a daily cap and a watermark; **a recurring referral share spreads the product through streamer-to-streamer word of mouth** | [P] |
| **ChatArcade** | Parachute Drop and Plinko for Kick and Twitch; **Arcade Points** viewers earn by playing and spend on songs, questions, messages; Windows app | Free | Points as **non-cash rewards** (a song, a question) are the safe reward currency | [P] |
| **Coin Pusher Live** | Steam game for the streamer; viewers `!drop` coins on Twitch, Kick or YouTube; **monthly Twitch Drops**; cosmetics bought with points or Steam wallet | Streamer buys the game; free for viewers | Sold as a game the streamer buys; mixed Steam reviews (64% of 34); "not a gambling game" disclaimer is front and centre | [P] |
| **Crowd Control** | Viewers pay coins to trigger effects in the streamer's game | **Free, Pro $7.99 a month, Max $19.99**; streamers keep **80%** of paid coins; **$50 minimum, paid 30 days after month end** | The tool is free and **tiers unlock limits**; coin revenue split 80/20 | [P] |
| **Streamlabs Ultra / StreamElements** | Overlays, alerts, multistreaming, sponsorship marketplaces | Ultra **$27 a month** ($189 a year); StreamElements core free, **no cut of tips** | A streamer budget band of **$0 to $27 a month** | [P] |
| **Stream Raiders** | Streamer as captain, viewers as army | Free to play; cosmetics | **Shut down March 2025** despite funding ([business-plan.md](../../../../business-plan.md) section 4) | [S] |

**Pricing consequence.** A streamer will pay **about $8 to $27 a month** for tooling. We set the Pro channel plan at **$14 a month** [U], with a **free tier** (watermark and daily cap, as Livecade does), a small one-time setup fee, and a **30% to 12 months referral** idea scaled down to what we can afford (section 5, N5).

### 2.1 What makes ours different (and what is not different)

| Dimension | Streamer Arcade and the others | Funcaster |
| --- | --- | --- |
| Who builds custom games | The company, by quote | **A marketplace of creators**, paid by escrow (section 6) |
| Money | Platform money passes through to the streamer; no new rails | Same (we never touch Bits, Super Chats or Kicks) **plus** our own rails: supporters, sponsors, community crowdfunds, instant creator payouts |
| Audience | Online chat | **The same games also play in cafés, colleges and fests** (one catalogue, two audiences) |
| Verified results | Not stated | Replay-verified boards and ranked play (T2) |
| Pricing | Quoted per channel | Self-serve, public price book |
| **Not different** | Twitch live, YouTube beta, Kick beta | **We are at a similar starting point on all three platforms; we do not claim to be ahead.** The differentiators are the marketplace, the rails and the venue link |

## 3. The three platforms (verified capabilities, limits and rules)

### 3.1 Capability matrix

| Capability | Twitch | YouTube | Kick |
| --- | --- | --- | --- |
| **Read chat** | EventSub `channel.chat.message` (needs `user:read:chat`; with an app token also `user:bot` and either `channel:bot` or moderator status) [P] | `liveChatMessages.streamList`, a long-lived stream; **5 quota units per call**, **10,000 units a day per project** by default; more needs a **compliance audit** [P] | Webhook `chat.message.sent`; the webhook URL must be public HTTPS; payloads are signature-verified with Kick's public key [P] |
| **Paid-chat events** | `channel.cheer` (`bits:read`, broadcaster-authorised) and `channel.bits.use` [P]; cheers can also be read from chat [P] | Super Chat and Super Sticker in the live chat stream; `superChatEvents.list` returns the last 30 days; **`giftEvent`** in live chat 6 November 2026 (`giftDetails` with name, Jewels, combo count, visual-effect flag; 6 November 2026) [P] | **`kicks.gifted`** (amount, name, tier, message, pinned seconds), plus sub new, renewal and gifts [P] |
| **Points and rewards** | Channel Points redemptions (EventSub) [S] | None found [U] | **Channel rewards API** (create, update, delete; up to 50) and the `channel.reward.redemption.updated` webhook [P] |
| **Follow, sub, raid** | Yes (EventSub) [S] | Memberships appear in live chat [S] | Follow, sub and gift-sub webhooks [P] |
| **Send chat** | Send Chat Message API [S] | `liveChatMessages.insert` (costs quota) [S] | `POST /public/v1/chat` [P] |
| **Live status** | `stream.online` and `stream.offline` [S] | Broadcast state [S] | `livestream.status.updated` [P] |
| **Whispers or DMs to pair a phone** | Restricted [S] | None | None found [U] |
| **Streamer keeps** | Bits: $0.01 per Bit to the streamer, viewer pays about $0.014 [S]; $50 minimum payout [P] | Super Chat and Stickers **70%** after tax and store fees [P]; Gifts: **100 Rubies = $1** [P] | **95%** of subs and Kicks (5% for processing); **no payout minimum**, monthly or weekly [P] |
| **Where the audience is** | About 21.0% of Q2 2026 live hours; **under 2% of India's** [P, S] | About **60.3%** of hours; India's creators are YouTube-first [P, S] | About 6.2% of hours (1.34B of 21.5B, my arithmetic), up 36.7% year on year [P] |
| **24/7 streams** | Allowed; each broadcast ends at **48 hours**; reruns capped at 720p [S] | Allowed; streams over **12 hours may not be archived** [S] | Allowed, but **pre-recorded or blank streams can cost verification and Partner status** [S] |

### 3.2 Platform rules that bind the design

| Platform | Rule | What we do |
| --- | --- | --- |
| **Twitch** | **Bits Acceptable Use Policy, last 6 November 2026 [P]:** Bits "are not a currency or money instrument"; they **may not be used or exchanged for functionality outside Twitch or for goods or services of monetary value**; allowed uses include **community goals, leaderboards and triggering content**; prohibited: **using Bits as a bet or wager** and selling or transferring Bits | **Bits only trigger on-stream content. They never become our coins, never go on-chain, never unlock off-Twitch rewards, and never fund a wager or a prize** |
| **Twitch** | Extensions policy (separate): no pay-to-play with Bits, no gambling, no wagering, no loot boxes; Bits for effects, voting and free-to-play enrichment [P, [business-plan.md](../../../../business-plan.md) section 6] | Direct triggers by `channel.cheer` are the primary path; an Extension is optional and later |
| **YouTube** | API policies cap stored data at **30 days** and bar rewarding users for engaging with YouTube features such as likes and subscriptions [P, [business-plan.md](../../../../business-plan.md) section 6] | Retention limits in the gateway; no rewards for likes or subscribes |
| **Kick** | Community Guidelines 6 November 2026 (11 rules): sponsors licensed where gambling is shown, disclosure, age labels, and **no gambling with other users' money, buy-in giveaways included** [S] | Same stance: no stakes on stream; **cosmetic triggers only** |
| **India** | The Promotion and Regulation of Online Gaming Act bans online money games, including coins and tokens bought with money as "other stakes", and allows **subscription or one-time access fees** and in-app purchases in social games if they are not stakes ([24](24-business-model-and-revenue.md) section 4.5) | Triggers, passes and tips are access and cosmetic purchases; **no cash prizes for in-game performance**; counsel |

### 3.3 Two corrections to the earlier business plan

1. **"Bits and Super Chats cannot work because the streamer is offline."** Wrong for a live arcade broadcast: if the stream is live with the arcade as its scene, platform events flow. Only an **actually offline** channel has no events. **This is why the design needs either a streamer's encoder (OBS) or our own cloud source** (section 4.5).
2. **"Converting Bits to our coins is unconfirmed; ask Twitch."** The stance is now clear: **do not convert**. 6 November 2026 policy explicitly permits **triggering content** and leaderboards with Bits and forbids money-like use. Streamer Arcade, Coin Pusher Live and ChatArcade all avoid Bits-as-currency; Crowd Control converts Bits only inside its **official Twitch Extension** [P]. Our design follows the direct-trigger pattern.

## 4. How the integration works in our app

### 4.1 Architecture (one gateway, three adapters)

```
Twitch EventSub ─┐
YouTube chat   ──┼─> PlatformGateway (relay side) ─> normalised StreamEvent ─> room/game logic
Kick webhooks  ──┘        │  verify signature, dedupe, rate-limit, quota-guard
                          └─> Ledger (hash receipts only) ─> Arkiv (evidence) ─> worker (Arc settlement)
```

- **One normalised event:** `StreamEvent { platform, channelId, platformUserId, kind: chat | command | paid | sub | follow | raid | redemption | status, tier, amountMinor, currency, ts, platformEventId }`. The game never sees a platform.
- **Idempotency and safety:** every event carries the platform's own id; replays are dropped; **Twitch and Kick signatures are verified**; payloads are size-limited; no secret ever reaches the browser.
- **The relay stays the authority** ([01](01-architecture.md)); the gateway lives beside it. **The worker holds the keys and is the only thing that touches Arc.** **Platform OAuth tokens, webhook secrets and Kick's verification keys are credentials: they live in a separate gateway process with its own env file (`.env.gateway`), never in the relay, the repository or a browser, and the relay receives only normalised, already-verified events** (the same file-outbox or local-socket pattern as the worker in [01](01-architecture.md)). Tokens are scoped to the minimum (read chat, read cheers, send chat). This closes a gap against rule 5 of [00](00-README.md) (keys only in the worker's environment), which was written for chain keys.
- **Flag and parity:** the gateway is off unless a channel is connected; `main` stays byte-identical with `PARTNERS=off`.

### 4.2 Identity: chat account to phone seat (no whispers, no wallet)

1. The phone page shows a **one-time short word** (and a QR to the same page). The streamer's overlay shows the room code.
2. The viewer types `!link <word>` in chat. The gateway sees a message from `platformUserId` containing the word, **binds that platform identity to the phone's session key**, and discards the word.
3. From then on the same person is one identity across **the chat command, the phone controller, the leaderboard, the ENS seat and the Arc seat** ([13](13-users-scenarios-and-accounts.md)). This works on all three platforms because it needs **only chat read**, which is also how Streamer Arcade solved YouTube.
4. Anti-spoof: a word is single-use, expires in two minutes, is bound to one room, and a platform identity can hold one seat per room.

### 4.3 Triggers (paid events become game moments, never money)

- The streamer's dashboard maps **event kind and tier to an in-game moment**: for example Twitch 100 Bits plus `!rain`, a Kick gift tier, a YouTube Super Chat band, a Channel Points reward, a Kick channel reward.
- **Rules built into the mapper:** triggers are **cosmetic or world events** (weather, a pond creature, a visual effect, a vote weight, a spotlight); they **never** change who wins money, never create a stake, never pay a viewer; amounts are shown as the platform's own units ("100 Bits"), never as dollars; per-viewer and per-minute **caps** and a **cooldown**; **a refund if the event could not be shown**; a **kill switch** (`!arcade off`).
- **Platform money is not touched.** Bits, Super Chats, Kicks and gifts are paid to the streamer by the platform exactly as today. **We take no cut of them** (as Streamer Arcade). A hashed receipt of each trigger may be logged for the streamer's stats; **no trigger amount is ever used to settle a payment on Arc.**

### 4.4 Moderation, safety and the overlay

- **Commands:** `!arcade off | skip | game <name> | poll` for the streamer and mods, mirrored in the dashboard; blocklists; nickname filter; per-user rate limits; a **panic key** that blanks the overlay.
- **OBS browser source:** one 1920×1080 page, "Control audio via OBS" ticked, **read-only** (the display role in [05](05-ui-integration.md)): the game, the join QR and word, the top ten, a ticker of triggers, a sponsor slot (section 5, N1).
- **Delay-aware modes:** slow chat games for stream delay (votes, commands); **realtime games on the phone** only.
- **Minors:** age labels, no cash flows to minors, no trigger solicitation to children (counsel).

### 4.5 Always-on: three ways to keep the arcade live

| Option | How | Cost and risk |
| --- | --- | --- |
| **A. The streamer's encoder** (as Streamer Arcade) | OBS Browser Source on the streamer's PC; our servers run the games | Simple; the PC must stay on |
| **B. A cloud source we run** | A headless browser renders the arcade page and pushes **RTMP** to the channel; auto-reconnect before Twitch's **48-hour** cut | Server cost per channel (about one browser and one encoder); **Kick may treat it as pre-recorded or blank**, YouTube streams over **12 hours may not archive** [S]; confirm with each platform; **after the event (SL15)** |
| **C. A web room only** | No stream; a stable link and QR for the community | Free; no platform events |

## 5. The new income streams, and who gets what

**The honest frame.** "Completely new" does not mean "free money". The platform money (Bits, Super Chats, Kicks, gifts, subs) already exists; the arcade makes it flow **in more hours and with more reason**. The streams below are **ours**, on **our rails**, and are modelled in section 8 with all inputs [U].

| # | Income stream | Who pays | Who is paid | Platform share |
| --- | --- | --- | --- | --- |
| **N0** | **Platform-native paid events during arcade hours** (Bits, Super Chats, Kicks, gifts) | Viewers, through the platform | **100% the streamer, through the platform** | **0%** |
| **N1** | **Sponsored after-hours seasons.** A brand funds a branded game or season on a channel; paid by **verified engaged viewer-hours** (section 6, `UptimeStream`) | Brand or sponsor | Streamer 50%, creators 25% (the game and the brand skin), platform 25% [U] | 25% |
| **N2** | **Community-funded custom games.** The community pledges toward a bespoke game for its streamer ("the mossy pond game"); a creator builds it; milestone escrow, refund on failure | Viewers and the streamer | Creator 75%, streamer 10%, platform 15% [U] | 15% |
| **N3** | **Supporter passes and tips on our rail** (access and cosmetic, not stakes) | Viewers | Streamer 80%, the game's creator 15%, platform 5% [U] | 5% |
| **N4** | **Creator usage royalties.** Every channel that runs a creator's game counts in the creator pool by verified channel-hours, with the long-tail floor of [24](24-business-model-and-revenue.md) | Funded by channel subscriptions and sponsors | Creators | (pool) |
| **N5** | **Streamer network referral.** A streamer who recruits another streamer earns **10% of that channel's plan fees for 12 months**, vesting daily (Livecade pays 30% for 12 months [P]; we pay less) | Funded from our plan revenue | The referrer | -10% of subscription revenue |
| **N6** | **Channel plans and setup** (SaaS): **Free** (watermark, daily cap), **Pro $14 a month** [U], **one-time setup $250** [U] | Streamers | Platform | 100% |
| **N7** | **Venue and fest crossover.** The same game runs on a café console, a college fest or a stream: a sponsor buys **both** inventories ([24](24-business-model-and-revenue.md) E1 and E2) | Brand | Creators, venue, streamer | per [24](24-business-model-and-revenue.md) |

**Why each party gains**

| Party | What they get | What they do not risk |
| --- | --- | --- |
| **Game creators** | Bespoke commissions funded by communities and brands (N2, N1), usage royalties (N4), instant payouts, an audience of streamers | A wager never pays them |
| **Streamers** | After-hours activity that keeps platform money flowing (N0), sponsor money (N1), a share of community games (N2) and tips (N3), referral income (N5), free to start | Their platform payouts and Bits stay theirs; no coins, no wagering on stream |
| **Viewers** | A reason to return, a seat on a persistent board, pledges that **refund on failure** | No Bits-for-prizes; no stakes |
| **Sponsors** | Pay for **verified engagement**, not promises; escrow; a report | Money released only on attested units |
| **Mods and community** | Mod commands with visible reputation; an optional small mod slot in the channel split | |
| **Agencies and networks** | A referral slot in the contract | |
| **Platform (us)** | Plans, setup, 5% to 25% of the rails, venue crossover | |

## 6. Advanced smart-contract logic on Arc (all inside the app)

All of this reuses the Studio-built contracts of [23](23-creator-platform-and-economy.md): `RevenueRouter` (frozen split, EIP-3009 `pay`, pull credits, claim), `CreatorPool` (Merkle root, challenge window, vesting, share cap) and `BountyEscrow` (milestones, two-of-three dispute, timeout refund). **Four additions** make the streamer economy real. The Arc prize named **conditional escrow with dispute resolution** and **payment splitting** as the examples of advanced stablecoin logic ([23](23-creator-platform-and-economy.md) section 5); these are those examples applied to streaming.

| Contract | What it does | Advanced logic it shows | Reuses |
| --- | --- | --- | --- |
| **`ChannelRouter`** (extends `RevenueRouter`) | A channel (an **ENS name**, for example `cozyclouds.funcaster.eth`) has a **frozen split**: streamer, the game's creator(s) by usage, an optional **mod pool (at most 10%)**, an optional **referrer slot** (vesting 12 months), the platform. Tips and supporter passes pay through it in one transaction | Payment splitting with dynamic payee (the game in use), vesting referral, deterministic rounding, pull credits | `RevenueRouter`, `SplitPayout` |
| **`UptimeStream`** (sponsor streaming payments) | A sponsor deposits a budget with a **rate per verified engaged viewer-hour**, an **epoch cap** and a **minimum**. Each epoch the relay publishes a **signed attestation** `(campaign, channel, epoch, units, evidenceHash)`; a **challenge window** follows; then the epoch **releases pro rata to the split** (streamer, creators, platform). Unspent budget is refundable after the end; the guardian can pause for at most 14 days | **Conditional, time-sliced streaming payment** driven by an oracle with a dispute window, caps, refund and a pause; **pay for outcomes** | `BountyEscrow` oracle layer, `SeasonVault` challenge window |
| **`CommunityFund`** (crowdfunded custom game) | Pledges in USDC (gasless EIP-3009) toward a **goal and deadline**, all-or-nothing; when funded, creators **bid**; the winner is chosen by the streamer plus a **vote weighted by the square root of each pledge**, one vote per distinct pledger; **milestones** (playable prototype accepted by review and the streamer, launch-week plays by distinct humans, 30-day retention) release **30 / 40 / 30**; failure **refunds the unreleased amount pro rata**; overfunding is capped at 120% and the rest refunded | **Conditional escrow with refunds, governance by quadratic-style weighting, milestone release** | `BountyEscrow` |
| **Channel usage in `CreatorPool`** | The weights gain a **verified channel-hours** term; the 30% floor, the 25% share cap and the new-player bonus stay ([24](24-business-model-and-revenue.md) section 4.4) | Merkle claims against a recomputable root | `CreatorPool` |

**What the contracts never do (the two-rails rule, extended).** They never accept, price or settle **Bits, Super Chats, Kicks or gifts**; they never pay a player for a result; **sponsor money pays for engaged hours and for building games, not for winning**; the Season Cup and pots remain play money on testnet. A trigger receipt is evidence for a streamer's stats and nothing else.

**Where the oracle sits (honest limits).** The attestation is produced by **our relay**, which is the live authority; it counts **distinct linked humans with at least N seconds of play** (not raw viewers), capped per person, **not** the platform's concurrent-viewer number (a platform can be botted and gives us no signed proof). Evidence is published to Arkiv; an **independent verifier agent (ERC-8004)** can recompute epochs from the logs; the sponsor may contest within the window. The README states that the relay is the measurement authority.

**Why on-chain rather than a database:** sponsors and creators verify the **same** attested hours and the **same** split; a creator is paid **per epoch** in USDC with no minimum (Twitch needs $50, Crowd Control $50 and 30 days, Discord $100 and 45 days, [24](24-business-model-and-revenue.md) section 2.4); a community's pledges **refund automatically** if nothing ships; a streamer carries **no payment-processing duty**.

## 7. Platform-by-platform plan

| | Twitch | YouTube (first for India) | Kick |
| --- | --- | --- | --- |
| **Connect** | Broadcaster OAuth (`bits:read`, chat scopes, channel points) | OAuth with `youtube.readonly` and chat scopes in a Google Cloud project | App created in the Developer tab; an **app access token can subscribe to any channel by user id**, with the streamer's consent flow for chat send |
| **Events used** | `channel.chat.message`, `channel.cheer`, redemptions, subs, raids, stream online or offline | `liveChatMessages.streamList` (chat, Super Chat, Sticker, gifts, memberships) | `chat.message.sent`, `kicks.gifted`, sub events, `channel.reward.redemption.updated`, `livestream.status.updated` |
| **Default triggers** | 100 Bits per effect; Channel Points for free effects; raids spawn a crowd | Super Chat bands; gifts by Jewels; chat votes | Kick gift tiers; channel rewards; `!` commands |
| **Pairing** | `!link word` | `!link word` (no whispers) | `!link word` |
| **Binding constraint** | Bits policy (section 3.2); **Bits only trigger content** | **Quota 10,000 units a day per project**: scaling beyond the pilot needs the **compliance audit**; data kept at most 30 days | Webhook delivery needs a public URL and signature checks; **pre-recorded or blank streams jeopardise status** |
| **India fit** | Low (under 2% of hours) | **High** (60.3% of hours) | Growing (+36.7% year on year), small |
| **Milestone** | Real channel in the event window (**our own test channel**) | Real channel with pairing, a mock for Super Chat if the account cannot take it | Real channel via webhooks; mock if app approval is late |

**Rule:** all three share one gateway and one event schema, so a platform that is late is a **mock adapter plus a recorded real-event fixture**, never a different game path.

## 8. The streamer-line revenue model (all inputs [U])

### 8.1 Inputs

| Input | Value | Basis |
| --- | --- | --- |
| Pro channel plan | **$14 a month** (₹1,332) | Between Crowd Control Pro $7.99, Livecade Pro $12.99 and Streamlabs Ultra $27 [P] |
| Setup fee | **$250** one time (₹23,780) | Streamer Arcade charges an unpublished fee; this is a placeholder |
| Custom community game | **$3,500** gross | Reskin $1,500, campaign $3,500, custom $6,000 [V] ([24](24-business-model-and-revenue.md) section 4.1) |
| Sponsored season on one channel | **$1,000** gross | A 15-viewer after-hours audience for 8 hours a day for 30 days is 3,600 viewer-hours; at about **$0.30 per viewer-hour** (half of the $0.60 to $1.50 sponsorship band [S], because an arcade overlay is a weaker placement than a host read) is **$1,080** |
| Supporter and tip volume | Monthly gross on our rail | [U] |
| Referral | 10% of subscription revenue for 12 months | A fraction of Livecade's 30% [P] |
| Splits | Custom game 75 creator / 10 streamer / 15 platform; season 50 streamer / 25 creators / 25 platform; supporter 80 / 15 / 5 | Section 5 |
| Market size check | **About 33,000 Twitch and 6,600 Kick channels** have 25 or more average viewers (modelled, August 2026) | FindStreamers [S]; YouTube not counted |

### 8.2 Scenarios, month 12 (USD a month)

| | Conservative | **Base** | Ambitious |
| --- | --- | --- | --- |
| Paying Pro channels | 40 | **120** | 500 |
| New channels set up a month | 5 | **12** | 40 |
| Custom community games a month | 0.5 | **2** | 6 |
| Sponsored seasons a month | 1 | **5** | 20 |
| Supporter and tip volume | $500 | **$3,000** | $15,000 |
| **Gross billings** | $5,060 | **$19,680** | $73,000 |
| **Our revenue** (after the referral payout) | $2,292 | **$6,962** | $25,200 |
| Our revenue a year | $27,500 | **$83,500** | $302,400 |
| Paid to streamers (from our rails) | $1,075 | **$5,600** | $24,100 |
| Paid to creators | $1,638 | **$6,950** | $23,000 |
| Streamer rails income per paying channel | $27 | **$47** | $48 |

**Combined with the venue and creator line** ([24](24-business-model-and-revenue.md) base, $7,322 a month): about **$14,300 a month, about $171,000 a year** at month 12, base case.

### 8.3 What moves it (base, doubling one input)

| Lever (doubled) | Added monthly revenue |
| --- | --- |
| New channels set up a month (12 to 24) | **+$3,000** |
| Paying Pro channels (120 to 240) | +$1,512 |
| Sponsored seasons (5 to 10) | +$1,250 |
| Custom community games (2 to 4) | +$1,050 |
| Supporter and tip volume ($3,000 to $6,000) | +$150 |

### 8.4 Reading it honestly

- **The streamer's own gain from our rails is small:** about **$47 a month per paying channel** in the base case. We should **not** sell "streamers get rich". The credible pitch is: **free to start, sponsor and community money on top, and the platform money you already earn keeps flowing for more hours** (N0, which we cannot measure until pilots).
- The business is **setup, plans and sponsor seasons**; supporter tips are almost irrelevant to revenue (+$150), as the Stream Raiders lesson predicted ([business-plan.md](../../../../business-plan.md) section 4: **do not make streamer payout the business**).
- The model is **sensitive to onboarding speed** (setup fees) and **sponsor sales**, both of which are **sales and operations problems, not code**. The pilots in section 10 test them first.
- **One $3,500 custom game gives the platform $525 (15%), about the monthly fees of 37 Pro channels, and gives the creator $2,625.** Community-funded games are the **creator income engine** more than the platform's.

## 9. Guard-rails (never do these)

| Never | Why |
| --- | --- |
| Convert Bits, Super Chats, Kicks or gifts into currency, points that can be redeemed, or on-chain value | Twitch Bits policy, Extensions rules, Kick guidelines |
| Use a paid trigger as a bet, stake, entry fee or loot box | Bits policy; the Indian Act's "other stakes" |
| Pay a viewer cash or goods for a game result | Money-game and e-sport rules ([24](24-business-model-and-revenue.md) section 4.5) |
| Show stakes, pots, markets or cheers in an overlay | [business-plan.md](../../../../business-plan.md) section 11 |
| Take a cut of platform money | Streamer Arcade's own promise; it keeps trust |
| Rely on platform concurrent-viewer counts to pay a sponsor | Not signed, can be botted |
| Store chat data beyond the platform's limit (YouTube 30 days) | API policy |
| Run a 24/7 cloud source on Kick without confirming status rules | Partner status risk |
| Promise "works on all three platforms" before each adapter has a real-event test | Honesty rule of [19](19-verification-and-fix-protocol.md) |

## 10. Validation plan

| Weeks | Do | Pass mark | If it fails |
| --- | --- | --- | --- |
| 1 to 3 | **10 streamer pilots**: 4 YouTube (India), 3 Twitch, 3 Kick; a free month of Pro | **7 of 10 run an arcade session unaided** after setup; median **15 or more distinct linked players** in a session | Simplify setup; reduce games to the three chat-first ones |
| 2 to 6 | **3 sponsor conversations** for an after-hours season (one college club, one creator-tools brand, one local brand) | **1 paid season** or 2 signed letters of intent | Bundle channels; sell through venues and fests first |
| 3 to 8 | **2 community-funded games** | 1 reaches its goal and ships its first milestone | Fall back to sponsor commissions only |
| 4 to 8 | Track after-hours engagement | **Median after-hours distinct players per channel at least 10 for 14 days** | The core hypothesis ([business-plan.md](../../../../business-plan.md) section 1) is not supported; re-scope to events |
| 8 | Review | **Two of the three** (sessions, sponsor, community game) | Stop the streamer line; keep venues and the creator marketplace |

**Metrics:** setup time to first session; sessions per channel per week; distinct linked players; trigger rate per 100 viewers; sponsor sell-through; pledge conversion; creator payout time; takedowns and moderation actions.

## 11. Tasks (lane SL; estimates are mine for one engineer; the cut line follows [22](22-integration-review.md))

| ID | Task | Depends on | Hours | Gate |
| --- | --- | --- | --- | --- |
| SL1 | `PlatformGateway`: normalised `StreamEvent`, signature verification, dedupe, rate limits, quota guard, a **mock adapter** and recorded fixtures | S | 12 | G4 |
| SL2 | **Twitch adapter:** broadcaster OAuth, EventSub (chat, cheer, redemptions, subs, raids, status), send chat, token refresh | SL1 | 16 | G4 |
| SL3 | **Kick adapter:** OAuth 2.1, webhooks with public-key verification, chat send, rewards, `kicks.gifted`, status | SL1 | 14 | G4 (mock) / G5 (real) |
| SL4 | **YouTube adapter:** OAuth, `streamList`, Super Chat, `giftEvent`, memberships, quota guard | SL1 | 16 | G4 (mock) / G5 (real) |
| SL5 | **Chat to phone linking** (`!link word`, QR, anti-spoof, one seat per room) bound to the session key | SL1, X lane | 10 | G4 |
| SL6 | **Arcade Mode and overlay:** the 1920×1080 browser source, persistent room, queue, commands, delay-aware modes (merges CP18 of [24](24-business-model-and-revenue.md)) | CP18, room persistence | 20 | G4 |
| SL7 | **Trigger mapper** and streamer dashboard configuration: tiers, caps, cooldowns, refunds, cosmetic-only guard, kill switch | SL1, SL6 | 12 | G4 |
| SL8 | **Moderation and safety:** mod commands, blocklists, nickname filter, panic key, compliance checklist | SL6 | 10 | G4 |
| SL9 | **`ChannelRouter`** and channel ENS names (extends CP1) | CP1, CP15, E lane | 14 | G4 |
| SL10 | **`UptimeStream`:** budget, epochs, attestations, challenge window, refund, pause; attestation producer in the relay | CP1, CP7, I lane | 24 | G5 |
| SL11 | **`CommunityFund`:** pledges, goal and deadline, bids, weighted vote, milestones, refunds | CP7 | 22 | G4 |
| SL12 | **Channel-hours weights** into `CreatorPool` | CP6 | 10 | G5 |
| SL13 | **Streamer dashboard and sponsor portal:** campaign setup, verified-hour reports | SL7, SL10 | 20 | G5 |
| SL14 | **Network referral** (vesting, dashboard) | SL9 | 8 | G5 |
| SL15 | **Cloud arcade source** (headless browser to RTMP, auto-reconnect) | SL6 | 24 | After the event |
| SL16 | **Channel plans and billing** (USD and INR; folds into CP21) | CP21 | 12 | After the event |
| SL17 | **Approvals:** register the Twitch and Kick apps; YouTube **audit and quota form**; written confirmations from Twitch and Kick on the trigger model | none | 8 plus waiting time | Start now |

About **208 hours** before the event if everything were built (SL1 to SL14), **44 hours after** (SL15 to SL17). [22](22-integration-review.md) already says the hours exceed the time; the **cut order** is: **SL1, SL2, SL5, SL6, SL7, SL8 (a real Twitch session on our test channel, with mock YouTube and Kick), then SL9 and SL11 (the contracts), then SL3 and SL4 real, then SL10, SL12 to SL14.** SL17 has a **waiting time that cannot be compressed**, so it starts first.

### 11.1 Verification items (added to [19](19-verification-and-fix-protocol.md))

VG-01 (signatures: forged Twitch and Kick events rejected), VG-02 (replay and duplicate events dropped), VG-03 (rate and quota guard: no adapter exceeds its budget; YouTube reconnect uses `nextPageToken`), VG-04 (link word: single use, expiry, one seat per room), VG-05 (trigger mapper: no trigger changes a result or creates a stake; caps and cooldowns hold; the kill switch blanks the overlay in under a second), VG-06 (no Bits, Super Chat or Kicks value ever reaches the worker or the chain). VA-16 (`ChannelRouter`), VA-17 (`UptimeStream`: releases only on attested units, epoch cap and minimum, challenge freezes an epoch, refund of the unspent budget, pause lapses), VA-18 (`CommunityFund`: deadline refund, milestone release, overfunding cap, vote weights). VX-13 (stream end to end: a viewer links, plays, triggers an effect with a cheer, a tip splits on Arc, the sponsor epoch releases).

## 12. Pitch additions

**One paragraph.** *"A streamer logs off and the stream goes quiet. Funcaster keeps it alive: viewers play from chat or their phone, climb a board, and the streamer's Bits, Super Chats and Kicks trigger in-game moments exactly as today, with no cut taken. On top, brands pay for **verified engaged hours**, and a community can crowdfund a custom game for its streamer that a creator builds and is paid for milestone by milestone, with automatic refunds if nothing ships. It runs on Twitch, YouTube and Kick through one gateway, and the same games also play in cafés and colleges."*

| Likely question | Answer |
| --- | --- |
| "Streamer Arcade already does this." | Yes, it validates the idea. It is a quoted services business with hand-built custom games and no money rails. We add a **creator marketplace**, **sponsor escrow paid per verified hour**, **community-funded games with refunds**, a **self-serve price book**, and the **same catalogue in venues** |
| "Do you convert Bits into coins?" | **No.** Bits only trigger content, as Twitch's own policy allows; we take no cut of platform money |
| "Is a paid trigger gambling?" | It is a cosmetic or world event with **no stake and no prize**; no cash goes to players; counsel confirms the Indian line |
| "Why a chain?" | Sponsors and creators check the same attested hours and split; per-epoch payout with no minimum; automatic refunds for crowdfunds |
| "How do you know viewers exist after hours?" | We do not yet; the pilot's hypothesis test is the **after-hours median of 10 distinct players for 14 days** |
| "All three platforms?" | One gateway, three adapters. **Twitch first, then Kick and YouTube**, each real only after its own real-event test |

## 13. Sources and gaps

**Sources (6 November 2026; mostly search extracts, not full-page reads except the Streamer Arcade page and Kick's webhook payload page):** streamercade.live (page and `robots.txt`); Twitch EventSub reference, Bits Acceptable Use Policy (6 November 2026), Developer Services Agreement and the Bits in Extensions help page; YouTube Live Streaming API reference (`streamList`, `superChatEvents`, revision history to 6 November 2026), quota and compliance audit page, Super Chat and Gifts creator pages; Kick developer docs (events introduction, webhook payloads, Swagger), Kick help centre revenue-split page and the Partner programme page; Livecade pricing and affiliate pages; ChatArcade; CPWGames and the Coin Pusher Live Steam page; Crowd Control plans and coin pages; Streamlabs and StreamElements pricing; FindStreamers, InfluencerFee and Sponsee sponsorship rate pages; Upstream and PulseCast 24/7 stream rules; the earlier guides' sources.

**Known gaps (verify before relying on them):** Twitch's and Kick's **written view** on the trigger model and on a cloud-run arcade channel; whether **YouTube Gifts** are available to creators in India for third-party encoders (the creator page says US creators; the earlier note says India 6 November 2026 [P, business-plan]); **YouTube quota per project and the audit timeline**; Kick app approval; the Twitch and Kick **chat-send** limits; the existence and size of **after-hours audiences** (no published data); the sponsor willingness to pay for **engaged hours** (the CPVH band is for host reads); payouts, tax and the sponsor "bounty versus prize" line for counsel; the Streamer Arcade traction (not published).
