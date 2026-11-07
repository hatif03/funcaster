# Web3 plan 04: World (proof of human for seats, boards and agents)

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. **World has not published its Mumbai tracks** ($12,500, "Prize details coming soon"; the page lists no tracks and no Continuity prize yet). The owner's inside information is that they will probably be about **World ID, IDKit or AgentKit, possibly in a particular scenario**. This plan therefore covers all three keys and a scenario, and is built from World's current docs and from what World asked for at every 2026 ETHGlobal event I could open. Labels: **F** = verified from a fetched page, **I** = my inference, **U** = unknown or conflicting.

> **6 November update:** with friend stakes ([08](08-stakes-product-and-legal.md)) the verify-once-per-profile model gains a hard rule: **only a verified distinct human can hold a stake**, and a staked match needs every seat verified from start to finish. The pot contract checks seat addresses supplied by the relay after verification ([09](09-arc-pot-and-settlement-plan.md)); the humans-only badge and the stake gate are the first 14 to 18 hours of this plan, the sybil-resistant event board, ghost agents and ranked gate the rest. **From the winner patterns ([10](10-winner-patterns.md)):** above a stake threshold, require a **step-up Selfie Check whose signal is bound to the pot id and seat** (as Commitment Issues binds the commit SHA, Surety gates each claim, Tide re-authenticates), show the **repeat-human refusal live** (as Novi Corpus does), aim at the Selfie Check and IDKit-style tracks first, and keep the AgentKit ghost seat small (agent entries are crowded).

## 1. What to expect (the best predictor is the sibling events)

| Event (2026) | World's tracks | The language that matters |
| --- | --- | --- |
| **New York** ($15k) | A: **AgentKit** ($7.5k). B: **World ID 4.0** ($2.5k). C: **Existing projects, Continuity only** ($2.5k). D: ProveKit ($2.5k) | AgentKit "in a meaningful way (not just a wrapper)", a trial or initial-usage mechanic gated by verified humans, human-backed agents that *operate*. World ID "as a real constraint": **justify it by explaining what breaks without it**; a working app (mini app or not); proofs validated in a web backend or contract. Continuity: an existing working product, meaningful use of IDKit, MiniKit or AgentKit, **a plan for what ships during the hackathon**, judged on "how novel the use case for World ID is" and "technical integration readiness" |
| **Cannes** ($20k) | AgentKit ($8k), World ID 4.0 ($8k), MiniKit 2.0 ($4k) | AgentKit must "distinguish human-backed agents from bots or automated scripts"; MiniKit required a Mini App and excluded gambling |
| **Lisbon** ($15k) | "AgentKit New Use Cases" ($8k); Selfie Check Beta and Identity Check Beta (two prizes each, one Continuity only) | AgentKit **excluded** reused patterns (agent reputation, simple content generation, human-backed perks such as API discounts); asked for documented testing with developer and user feedback for the beta credentials |

**I:** Mumbai's pool is smaller, so expect **two or three tracks**: an AgentKit track (probably the biggest share), a World ID 4.0 track with the "breaks without proof of human" test, and possibly a Continuity track or a Selfie Check track. A Mini App is probably **not** required except for a MiniKit track (IDKit works in a normal mobile browser; **F**).

**Why this product fits.** Our standing rule is **"Multiplayer is humans-only by default; AI is an opt-in."** Proof of human is exactly what makes that rule *verifiable* instead of a promise, and it fails visibly without it (a script can sit in a seat or post a perfect score). That is the "real constraint" the World ID track asks for. The same product has **bots, helper agents and ghosts** (the Time Trial ghost and replay system exist), which is the AgentKit story: a **human-backed agent that races on its owner's behalf, provably owned and capped**.

## 2. What the technology is (F unless marked)

**IDKit** (`@worldcoin/idkit` React widget and `@worldcoin/idkit-core` vanilla, both 4.5.0 on 6 November; `@worldcoin/idkit-server` 1.2.0; the old `idkit-standalone` is discontinued). Docs index: `docs.world.org/llms.txt`.

1. Create an app in the Developer Portal (`developer.world.org`): `app_id`, `rp_id`, `signing_key` (**secret**).
2. Backend: `signRequest({ signingKeyHex, action })` (from `@worldcoin/idkit-core/signing`) returns `sig`, `nonce`, `created_at`, `expires_at` (EIP-191 secp256k1; default TTL 300 s; sign **per request**, never on the client).
3. Client: `rp_context = { rp_id, nonce, created_at, expires_at, signature }` then `IDKit.request({ app_id, action, rp_context, allow_legacy_proofs, environment }).preset(...)`. Outside World App it shows a **connect URL as a QR code** and polls (`pollUntilCompletion`); inside World App it uses a native transport.
4. Backend forwards the IDKit result **unchanged** to `POST https://developer.world.org/api/v4/verify/{rp_id}`; check `environment` before and after; store `UNIQUE(nullifier, action)` (convert the hex value to NUMERIC). Rate limits are **not documented**.
5. **Environments:** `production`, and for testing the simulator (`simulator.worldcoin.org`) or the **Sandbox** build of the World ID app (TestFlight and a private Google Play track; request access in the Developer Portal, `sandbox.access@toolsforhumanity.org`). A production backend must **reject** staging and sandbox proofs. Whether the simulator or the Sandbox is the recommended path now is **U**.

**Nullifiers and signals.** A nullifier identifies *one user + one app + one action*; the same person gets the same nullifier for the same action. In 4.0 "nullifiers are one-time-use": **do not use them as a persistent user id**; for returning users use **session proofs** (`session_id`), which the docs describe only with the Selfie credential (**U** for Orb). A **signal** is data bound into the proof (a user id, a seat); the backend must enforce the same value.

**Credential presets** (`docs.world.org/world-id/idkit/credentials`):

| Preset | Proves | Orb needed |
| --- | --- | --- |
| `proofOfHuman` | A unique human (highest assurance) | **Yes** |
| `passport` | An NFC passport credential | No |
| `selfieCheck` (credential 11) | Liveness and facial similarity, valid 90 days; returns a `sybil_score` from 0 to 10 (a **risk signal, not a uniqueness verdict**) | No (any World ID App user) |
| `identityCheck` (preview) | Document attributes | No (contact World) |
| `deviceLegacy` | Device-level | No (deprecated) |

`require_user_presence` can be added to any preset to force a fresh liveness check, which stops a verified person from lending a phone.

**AgentKit** (`@worldcoin/agentkit` 0.2.1, `@worldcoin/agentkit-cli`): a **beta extension to x402** that lets a server tell **human-backed agents from bots**. A human registers an agent wallet in **AgentBook** (contract `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` on World Chain, eip155:480) through a World App verification; the server later resolves the wallet to an **anonymous human id**. Registration: `npx @worldcoin/agentkit-cli register <agent-address>`; check with `status <address>`. Agent side: `createAgentkitClient({ signer }).fetch(url)` (tries AgentKit first, falls back to a normal x402 payment). Server side: `createAgentkitHooks({ agentBook, storage, mode })` with modes `free`, `free-trial { uses }`, `discount`; **usage counters are per human per endpoint, so all agents of one human share a counter** (a built-in cap per human). You must provide database storage for counters and nonces in production. **Caveats:** the **`worldcoin/agentkit` GitHub repository was archived and marked deprecated on 6 November 2026** with no replacement named, while the docs site and npm (0.2.1) still treat AgentKit as current and an 6 November World announcement lists "World ID for Agents (AgentKit)" as live (**U**: whether the code moved); the docs and the README disagree on the registration chain (World Chain versus Base mainnet or Sepolia); which credential level registration needs is **U** (assume Orb until shown otherwise); the human-id derivation is not documented.

**Mini Apps and MiniKit:** web apps inside World App; MiniKit 2.x no longer proxies verification (use IDKit). A phone controller page in Safari or Chrome can use IDKit (deep link or QR). Whether our IMU APIs work inside World App's webview is **U**.

**India (decisive for the live demo).** In December 2023 World stopped offering Orb verification in India, Brazil and France (it called the India pause temporary); in July 2023 Orbs ran in Bengaluru and Delhi NCR, none reported in Mumbai. I found **no 2026 source** confirming or denying Orb availability in India, and none on whether Selfie Check works for Indian users or whether the World ID app can be used there (**U**). **Assume Orb is unavailable to most Indian attendees**; plan the live demo around **Selfie Check and the Sandbox**, test both on Indian phones and SIMs beforehand, and note that international Devcon attendees may already be Orb-verified.

## 3. What we build (four features, one profile model)

**One model first: verify once per profile, not once per room.** Because a 4.0 nullifier is one-time-use per action, a per-room action would force every player to re-verify each time. The phone's **session key** (a browser keypair, the same one used by the other plans) identifies a *profile*; the proof's **signal** is `hash(profileAddress)`; the server records `humans(profile, nullifier, action, level, session_id, sybil_score, verified_at, UNIQUE(nullifier, action))`. **Two profiles cannot share one human** (the unique constraint rejects it), which is what makes a room's "distinct humans" claim true. `level` is one of `orb`, `selfie`, `sandbox`; **never mix environments**; store only the nullifier, `session_id` and level (never faces or documents).

| # | Feature | Flow and server rules | What breaks without World | Demo |
| --- | --- | --- | --- | --- |
| **a** | **Humans-only room** (the badge) | On the phone gate a **Verify** step opens the IDKit connect URL (deep link into the World ID app, or a QR on the TV). After the proof the phone shows a green badge. A room is **Verified humans** if every seat's profile has a verified record with a distinct nullifier, **Mixed** otherwise (the TV never blocks). `require_user_presence` when the seat takes the room | Our "humans-only multiplayer" promise becomes a claim anyone can fake with a script in a seat | Two phones verify; a third tries to reuse the first person's account and is rejected; the room badge flips |
| **b** | **Sybil-resistant event leaderboard** (the kiosk scenario) | Verify once per event: action `event-<id>`; `UNIQUE(event_id, game, nullifier)` on board rows. The server issues a **run ticket** (run id, seed, expiry) at start; the client cannot mint one. A score is accepted only if the server **re-simulates the replay** (the existing replay verification) and passes plausibility checks (kinematic limits on the input stream, a per-human attempt cap, a human-review flag for implausibly perfect runs). Unverified players post to a separate **guest** board | One person with many phones, or a script posting perfect runs, owns the board | A script floods the endpoint with a perfect run and is rejected; a real attendee verifies and posts |
| **c** | **Human-backed ghost seat** (AgentKit) | The owner registers a ghost wallet (`agentkit-cli register`), the ghost requests a seat from `POST /api/agent/seat` through `agentkit.fetch`; the server runs `createAgentkitHooks({ agentBook, storage, mode: { type: 'free-trial', uses: N } })`: **N free ghost runs per human per endpoint**, then x402 payment or refusal. The ghost **replays the owner's own verified run** (we already store replays and ghosts), races in a labelled **agent lane**, and the result records `agent_address` and `human_id`. An unregistered bot hitting the same endpoint is refused; **a failed AgentBook lookup is indistinguishable from "not registered", so treat it as an ordinary CPU bot** | Without it, "bots" and "your ghost" cannot be told apart, and an agent could spawn unlimited copies | A registered ghost gets a seat; an unregistered bot is refused; the run after the cap falls to the limit |
| **d** | **Ranked gate** | Ranked play needs a verified profile (a Selfie Check within 90 days, or Orb); re-prove with `IDKit.proveSession(savedSessionId)` on entering ranked; a high `sybil_score` routes to casual. Guests play casual only | Ranked is meaningless if anyone can have many identities | A guest is routed to casual; a verified player enters ranked |

**Fit with the AgentKit rules (I):** the ghost meets "a trial mechanic gated by verified humans" and "lets human-backed agents operate". Lisbon excluded *API discounts* and *reputation*: keep the pitch on **human-owned game agents with provable ownership, caps and a labelled lane (asynchronous multiplayer: your remote friend races your ghost while you are offline)**, not on perks. A cross-link with ENS: the ghost gets an ENS name whose record points at the owner's nullifier hash ([03](03-ens-plan.md) section 4.5).

**Honest limits to say in the pitch:** World proves a **unique person owns the account**, not that a person is moving the phone (a verified human can script their own phone): the replay check and plausibility rules are what make a board credible. **Selfie Check is not a strict one-person-one-account guarantee** (it is a risk score), and Orb is the strict one.

## 4. Server and phone pieces

- **Server** (under `integrations/world/`, with the sponsor-wallet-style separation of [02](02-integration-architecture.md)): `POST /api/world/rp-sig` (returns `signRequest`, rate-limited per session), `POST /api/world/verify` (forwards to the v4 verify endpoint, asserts `environment` equals the configured value, writes `humans`), `POST /api/agent/seat` (AgentKit hooks), the tables `humans` and `human_agents(agent_address, human_id, created_at)` plus AgentKit's counters and nonces **in the database, not in memory**. The signing key is server-side only, in the environment.
- **Phone:** a Verify button on the gate (skippable; guests always play), the badge, the ranked gate, a consent card; the connect URL deep-links into the World ID app on the same phone, with a QR fallback on the TV for a second device.
- **Shell:** the Players window shows the badge and level; the Invite window shows the room badge; the attract Leaderboard shows "N verified humans played today" and the guest and verified boards.
- **Kiosk:** the booth runs with verification **optional** and a clear guest path (a stranger must reach a game in about 20 seconds; verification is a bonus step that unlocks the verified board).

## 5. Effort (one strong engineer)

| Step | Hours |
| --- | --- |
| Portal app, keys, `rp-sig` and `verify` endpoints, `humans` table | 3 |
| Phone Verify UI (connect URL, deep link, QR fallback, badge) | 4 |
| (a) Humans-only room and TV badge | 4 |
| (d) Ranked gate with sessions | 3 |
| (b) Kiosk event board with ticketed runs | 5 |
| (c) AgentKit register, hooks, ghost seat | 8 |
| Sandbox and Selfie Check testing on Indian phones, error paths | 4 |
| Demo script, README separating pre-existing and new work | 3 |
| **Total** | **about 34** |

**Cut order if short:** (c)'s ghost uses a canned replay and a minimal lane, then (b)'s plausibility checks, then (d).

## 6. Before the event and the risks

**Before (non-code):** create the Developer Portal app now; **request Sandbox access now** (approval time unknown); put `RP_SIGNING_KEY`, `RP_ID` and `APP_ID` in an environment file; prototype in a **scratch repo**; ask an organiser whether a project like ours is Continuity for World and whether World has a Continuity prize (watch ETHGlobal's announcement on X); ask World at the venue about the AgentKit repository and the registration credential level.

| Risk | Mitigation |
| --- | --- |
| **Orb access in India** | Selfie Check and Sandbox as the demo path; a visible guest fallback; the games never depend on World |
| **AgentKit instability** (repo 6 November, beta) | Pin 0.2.1; re-read the docs on day one; keep the agent seat behind an interface that falls back to a CPU bot; test the CLI early on the testnet with `--manual`; the registration chain conflict (World Chain versus Base) to be settled by a spike |
| Selfie Check is not strict uniqueness | Say so; use `sybil_score`; Orb for the strict claim |
| Rate limits undocumented | Verify once per profile; cache; keep Sandbox credentials ready |
| A track requires a Mini App (MiniKit) | Do not claim a MiniKit track unless we build one |
| A real human scripts their own phone | Replay verification and plausibility checks; be honest in the demo |
| The Mumbai brief differs | The four features are separable; the profile model and endpoints serve any of them |

## Sources

ethglobal.com/events/mumbai/prizes/world; ETHGlobal New York, Cannes and Lisbon 2026 World prize pages; docs.world.org (llms.txt, world-id/idkit/integrate, javascript, signatures, credentials, concepts, session-proofs, 4-0-migration, sandbox, credentials/11, agents/agent-kit/integrate and sdk-reference, mini-apps); github.com/worldcoin/agentkit; npm package pages; TechCrunch and The Block on the December 2023 Orb pause; The Block on 6 November 2026 World announcement.
