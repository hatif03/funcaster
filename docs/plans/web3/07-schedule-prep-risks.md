# Web3 plan 07: preparation, the 36 hours, submission, and the risks

Part of the [web3 plan](README.md). Status: plan, 6 November 2026. Dates are from the ETHGlobal details page; hour-level timings are **inferred** and must be confirmed with the organisers.

## 1. The calendar

| Date | What | Note |
| --- | --- | --- |
| Now to 6 November | Preparation (section 2) and the Funcaster build ([build/07](../build/07-schedule-tests-runbook.md)) | Integration code **must not** be committed to the game repo yet |
| 6 November | Devcon 8 India starts (Jio World Centre); the booth runs | |
| 6 November | ETHGlobal Mumbai hacking starts | **The start time is not stated on the page.** A 36-hour hackathon ending at the 6 November 00:00 IST deadline implies a start of about 21:00 IST on 6 November (inference) |
| Thu 5 and 6 November | **The booth and the hackathon overlap** | Two crews: a booth crew and a hack crew (section 4) |
| **6 November 09:00 IST** | **Submission deadline, no late entries** | Stop building at 07:30 |
| After | Closing ceremony; partner winners announced | |

## 2. Preparation 6 November (allowed, and it keeps the 36 hours for building)

The rule is: **prepare accounts, keys, knowledge, scratch spikes and the baseline interfaces; do not write the integrations in the game repo.**

| Item | Detail | Owner |
| --- | --- | --- |
| **Baseline interfaces** (pre-existing work, committed and listed in `PRE_EXISTING.md`) | `server/integrations.cjs`, the mock providers, the browser shim, `docs/integrations.md`, an empty `integrations/` | Backend |
| **Hosted relay** (a prerequisite for all three) | Tier 1 of the hosting plan: a public HTTPS URL; World verification, ENS issuance and Arkiv writes need server endpoints and internet ([02](02-integration-architecture.md) section 6) | Ops |
| **Accounts and keys** | World developer portal app and signing key; a Sepolia wallet funded with test ETH, an ENS parent name registered; an Arkiv sponsor wallet funded from the faucet (a human CAPTCHA step) plus a spare | Each integration owner |
| **Scratch-repo spikes** | One per integration: **an Arc Studio project (export, deploy, faucet limits, USDC address and decimals) and the Chainlink CRE supported-chain list**, an IDKit proof round trip on staging, an Arkiv write and read, an ENSv2 name and subregistry on Sepolia (keeps the reserve live); throwaway repos, never the game repo | Each integration owner |
| ~~Legal opinion on stakes~~ | **Closed: handled by the owner (6 November)** | n/a |
| ~~Written eligibility confirmation and pre-existing-work disclosure~~ | **Closed: handled by the owner (6 November)** | n/a |
| **Read the briefs again** | The week of the event, and the moment World, Arkiv and Whitechain publish; update [README](README.md) | Lead |
| ~~Public-repo decision~~ | **Closed: handled by the owner (6 November); section 5 is background only** | n/a |
| **Organiser questions** | Hacking start time; team size (the eligibility questions are closed) | Lead |
| **Demo kit** | Two spare phones; a laptop with a screen recorder; the booth TV; a hotspot; a script (section 6) | Booth |

## 3. The 36 hours (plan, in hours from the start; adjust when the start time is confirmed)

| Hours | Work | Output |
| --- | --- | --- |
| **0 to 3** | First commit "event start: integrations scaffold" (small commits from here); wire `PARTNERS=on` end to end with mocks; confirm hosted relay, keys, faucets, parent name | A green baseline on the hosted instance |
| **3 to 15** | The three integrations in parallel, one owner each: **the pot on Arc ([09](09-arc-pot-and-settlement-plan.md), started in Arc Studio at hour 0 to 1)**, World ([04](04-world-plan.md)), Arkiv ([05](05-arkiv-plan.md)); ENS ([03](03-ens-plan.md)) only with a fifth engineer. Each lands behind its capability interface with a contract test | Each integration works against its real testnet |
| **15 to 24** | UI surfaces in Funcaster and the phone (badges, names, receipts, live leaderboard, consent card); end-to-end flow on the booth TV | A demo-able flow |
| **24 to 30** | Hardening: fault injection (provider down), offline `mock` fallback, **a scripted replay of a full staked match as the stage fallback**, the README sections per partner (each with a "what breaks without it" sentence, test counts and an honest limitations list, per [10](10-winner-patterns.md)), architecture diagram, `FEEDBACK.md` / `friction.md` where a sponsor asks | Submission materials drafted |
| **30 to 33** | Record the video (3:30, person speaking, no AI voice); final tests on real phones | Video file |
| **33 to 34.5** | Submission form: pick the **three partners** and the tracks, write the per-partner notes, link the repo and video, attach the AI-use record | Submitted |
| **34.5 to 36** | Buffer | Stop at 07:30 IST |

## 4. People

**Glossary.** *Booth crew*: the people who run the physical Funcaster booth at Devcon 8 India (6 November): setting up the TV and phones, helping visitors join, running the self-driving Kiosk. *Hack crew*: the people building the integrations during the ETHGlobal hackathon (6 November, a 36-hour sprint). The two events overlap on 6 November, and one person cannot do booth duty and the sprint at once, so the sprint needs its own people or the booth runs the Kiosk with a staff PIN. A staffing question for later, not a blocker.

At least **three integration owners** (the Arc pot, World, Arkiv; ENS only with a fifth person) plus a **lead** who owns the registry, the hosted relay, the demo and the submission. Because the booth runs on 5 6 November, the **booth crew** must be separate from the hack crew (or the booth runs the self-driving Kiosk with a staff PIN while the hack crew works). Confirm the headcount.

## 5. The public-repo problem (background: closed by the owner on 6 November)

Several sponsors require "open-source code" and a **public** repository (ENS: "live demo link and open-source code"; Uniswap: "A public GitHub repository with open-source code"; Hedera: "A public GitHub repo"), and EF's CROPS tracks require a free and open-source license. **Our repository is private**, and its history now contains **third-party material that must not be published**: the Nintendo-derived Kart Rush source archives that `plan.md` already flags, the supplied Windows UI pack (Microsoft artwork, sounds and fonts) and ten CraftPix zips committed on 6 November. Making this repository public as it stands would publish all of it.

| Option | What it means | Verdict |
| --- | --- | --- |
| **A. Clean history** | Rewrite history to remove `assets/source/`, the Kart Rush archives and any other third-party packs (for example with `git filter-repo`), then make the repository public | Cleanest for judges, but rewrites history, so every clone must be re-cloned and the Continuity "pre-existing versus new" story needs the baseline tagged first |
| **B. A clean public submission repo** | A new public repository whose first commit is a documented baseline snapshot **without** the third-party material, followed by the event's commits; `PRE_EXISTING.md` lists the baseline and links to the private history on request | Safe and quick; the baseline commit is large, which the "large single commits" rule could question, so state it plainly in the README |
| **C. Keep private and share access** | Ask ETHGlobal and each sponsor whether a private repository shared with named judge accounts is acceptable | Probably not accepted for the open-source requirements; ask, do not assume |

**Recommendation: B** (or A if the owner prefers one repository), decided by 6 November. **Do not make the current repository public.** Also: the Docker image already excludes `assets/source`, and the server returns 404 for `/assets/source`, so a hosted instance does not expose them.

## 6. The demo (3:30)

1. **The desktop** on the big screen: the Funcaster shell, the QR and the room name (an ENS name); one sentence: phones are the controllers and every match leaves a receipt you own.
2. **Two phones join**: one verifies as a human (World), one is a guest with a visible guest badge; seat names resolve from ENS.
3. **A short match** of the most reliable game (Star Catch, Bubble Burst or Golf are the safest; Kart Rush if it is stable).
4. **The result**: verified replay label, the **Results window** with its receipt; the **Leaderboard window updates live** (Arkiv); open the entity in the explorer (authorship, expiry, owner).
5. **The pot** ([09](09-arc-pot-and-settlement-plan.md) section 6): two phones accept the terms card and fund (Chonk's collar tags light up), the match runs, the pot pays in under a second; a second pot is contested and refunds; then **kill the relay and pull a refund**. Labelled "PLAY MONEY" throughout. (If ENS is built: the party name resolves live and the seats show expiring names.)
6. **The "humans only" proof**: a bot or guest seat is refused a stake, or a repeat verification from the same human is rejected (nullifier).
7. One sentence: what is new and what is pre-existing.

Video rules (from the event details and the earlier plan): 2 to 4 minutes (anything outside is rejected at upload), recorded on a computer, a person speaking, no text-to-speech or AI voice, no sped-up footage. Partner judging uses the written submission and the materials, so each partner gets its own README section, its own video moment and a list of the exact files and lines.

## 7. AI use and the repository record

The event requires AI use to be documented (where and how, with the specific files; spec and prompt files committed). Keep a running `AI-USE.md` from the first commit of the event. AI assists, it does not build everything: the design decisions and the integration choices are the team's.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| **The three unpublished briefs turn out unsuitable** | Build to the capability interfaces; keep two cheap options ready ([06](06-alternates.md)) and **choose the three partners at submission**, not before |
| The public-repo problem (section 5) | Decide by 6 November; never publish the current repository |
| **Real-value betting is likely unlawful in India** (online money games ban; tokens count as stakes) | Play-money testnet at the event, region gate, no rake, counsel by 6 November ([08](08-stakes-product-and-legal.md) section 6) |
| **The rules page restricts pre-existing work** unless the entry is Continuity | Written confirmation and disclosure ([README](README.md) section 3); small commits from hour 0 |
| Arc Studio is new and Studio-first | A spike this month; the contract spec is portable ([09](09-arc-pot-and-settlement-plan.md) section 9) |
| The booth and hackathon overlap | Two crews; the Kiosk runs itself |
| World verification unavailable to users in India | The staging simulator for the demo, labelled; the guest and ranked split means games always work ([04](04-world-plan.md)) |
| ENSv2 tooling is new and moving | A scratch spike now; a fallback of offchain subnames for the UI only if ENS allows ([03](03-ens-plan.md)) |
| Testnet outages or faucet limits | Funded spare keys; `mock` fallback; the outbox |
| Continuity rules (pre-existing versus new) | `PRE_EXISTING.md`, small commits from hour 0, the scratch-repo rule |
| A late brief changes the plan | The week-of re-read; the plan is modular |
| Time lost to the booth or to Funcaster bugs | The order of sacrifice in the build plan; the hosted instance is the only hard prerequisite |
