# Making people come and play: the event floor plan

> **Note, 6 November 2026.** The attract screen and the walk-up screens in this plan are now windows of the Windows-XP-style shell ([xp-console-ui.md](xp-console-ui.md) section 4.5), and the phone's first-tap flow is specified in [phone-controller-v2.md](phone-controller-v2.md) section 3. The funnel, kit, staffing and runbook here are unchanged.

Status: plan, 6 November 2026. Owner's goal: run the game at the hackathon and **make people come and play it**. This plan covers the booth or table experience, the technology it needs, the people, the runbook and the numbers to watch. The code it depends on is tracked in the other plans; nothing here is built.

## 1. What we know and what we do not

**Known (6 November 2026):**
- **Devcon 8 India:** 3-6 November 2026, Jio World Centre, BKC, Mumbai (devcon.org).
- **ETHGlobal Mumbai:** hackathon, 5-6 November 2026, "36 hours"; submission deadline **6 November 2026, 09:00 IST** (ethglobal.com/events/mumbai and the details page). Finalist judging is 7 minutes (4 demo, 3 questions); partner prizes are judged from the written submission; the demo video is optional but encouraged.
- ETHIndia is reported 6 November (a search summary, unconfirmed).

**Unknown, to confirm with the organisers before building a booth plan around it:** where exactly the hackathon floor is relative to Devcon; whether teams get tables, screens, power and a wired network; Wi-Fi quality and client isolation; whether public play with attendees is allowed in the hacking area or only at an expo or side event; noise and sound rules; opening hours; who may touch whose equipment. **First task: email the organisers with these questions** (and ask whether a public demo area exists outside the hacking floor).

**Three audiences, three approaches:**

| Audience | Who | What they need | Approach |
| --- | --- | --- | --- |
| **Hackers and judges** on the hacking floor | Tired builders and judges walking around for a few minutes | A 20-second reason to stop; something to show off; no setup | A table with a screen that plays itself (Kiosk mode) and a "scan and swing" sign |
| **The wider Devcon and Mumbai crowd** (if there is a public area or a side event) | Thousands, short attention, mixed phones | Instant, spectator-friendly, safe | Kiosk mode with a queue and leaderboard |
| **People who cannot be there** | Judges reviewing later, friends online | A link that works | A hosted public URL and the demo video |

## 2. The funnel we design for

**Notice, approach, join, play, win or lose, share, return.** Every step is one decision or less.

| Step | What the person experiences | Design requirement | Metric |
| --- | --- | --- | --- |
| **Notice** | A bright screen with motion, sound at a polite level, someone playing | Attract mode readable from 10 m: neon skyline, a taxi crossing, a huge QR, "SCAN. SWING. WIN." in English and Hinglish; a live leaderboard | Passers-by who slow or stop (count by hand) |
| **Approach** | They walk up and see the sign | The one instruction is on the sign and the screen; no menu to understand | Approaches per hour |
| **Join** | Camera scan, a page opens, tap Play, allow motion | Under 20 s; the permission flow coached; a "use touch instead" path; in-app-browser warning; works on mobile data, not only the booth Wi-Fi | Scan-to-ready time; join success rate |
| **Play** | A 60-90 second round, immediately | No pick-a-game decision (Kiosk rotation); the first round teaches itself in 10 seconds with a visible demo and no text wall | Round completion rate |
| **Win or lose** | Results with their rank and the champion's score | A 10-second HI-SCORE moment, the next round already counting down | Rematch rate |
| **Share** | "I beat the booth" | A results card with a QR link to the game and, later, a replay receipt; a photo corner | Shares and link visits |
| **Return** | They come back with a friend, or later | A "bring a friend" prompt; the leaderboard shows today's champion and the time of the next tournament; the link keeps working after the event | Repeat plays per phone |

## 3. Kiosk mode (what runs on the screen)

Specified fully in [host-phone-controls.md](host-phone-controls.md) section 4.1. For the booth:

- **The TV runs itself.** Attract loop, then a countdown when phones are ready, then a rotating playlist of short games, then results with the leaderboard, then the next round.
- **Nobody becomes the host.** No stranger can end a round or remove another player. Staff control the room with a PIN.
- **A "next up" queue.** Up to four play; others who scanned wait as spectators with a visible position and are promoted automatically, so a crowd forms a line instead of a mess.
- **Short rounds:** 60-90 s, so a queue of eight is clear in under ten minutes.
- **Reset to attract** after 60 s with no phones; leaderboard and counters persist across resets until staff clear them.
- **Safe defaults:** nicknames only (auto-generated friendly names, editable), no accounts, no personal data; a profanity filter on names; a "gentle mode" switch for children; a floor marking and a safety card for the swing area.

## 4. The line-up for a crowd

Short, spectator-friendly, verified where possible. Suggested rotation (to be playtested):

| Slot | Game | Why |
| --- | --- | --- |
| Opener | **Star Catch** (60 s, server-simulated, verified) | Zero learning; tilt only; fair identical streams |
| Spectacle | **Kart Rush**, one lap, split-screen for 2-4 | The flagship; reads well from a distance |
| Quick duel | **Slice Dojo** battle | Instantly understandable swinging |
| Chaos | **Bubble Burst** or **Neon Drift** | Server-simulated, verified |
| Two-player challenge | **Table Tennis** or **Foam Fencers** with "winner stays" | A crowd-pleasing "beat the builder" station |
| Closer | **Pocket Greens**, one hole | Turn-based and relaxed; good for groups |

Avoid long formats (a six-hole golf round, a three-lap race) in Kiosk rotation. The three server-simulated games are the safest at an event: tiny download, no heavy graphics, identical for every player, and their results are verified.

## 5. Competitions and hooks

- **Hourly and daily champions** on the HI-SCORE board, with a printed "champion of the hour" card. Non-monetary rewards only (stickers, a name on the board, a photo).
- **"Challenge the builders":** a two-player station where the team plays the current champion.
- **A bracket final** on the last afternoon for the top scorers, shown on the big screen (the bracket machinery exists).
- **A "bring a friend" bonus:** a round where two phones scanning together unlock a co-op mode.
- **A hackers' hook:** a second small screen showing how it works: phone to relay to screen, live latency, and replay verification ("play a round, then check your replay": a verified badge on the result). This fits the audience and prepares the later web3 story without any web3 code.
- **Share card:** a screenshot-friendly results card with the QR link.

## 6. The technology the event needs

| Need | Plan | Source of truth |
| --- | --- | --- |
| **Reliable connectivity** | Primary: a **hosted public instance** with a real HTTPS URL, so phones work on mobile data and judges can try it later. Backup: LAN with a travel router and a SIM hotspot. Third: the temporary tunnel script. Do not depend on the venue Wi-Fi | [plan.md 5b](../../plan.md); the Dockerfile exists but nothing is deployed; hosting is a decision the owner deferred to last, and it must be made before the event |
| **Kiosk mode, attract screen, leaderboard** | Build (section 3) | host plan K1, K2; visual plan V1 |
| **Spectator seats and "next up"** | Build | host plan H6; remaining-games X2, X8 |
| **Room safety for a public screen** | Room lock, kick list, join and room-creation rate limits (confirmed gaps in the audit) | host plan H5a |
| **Seat survives a sleeping phone** | Persist the seat token in `localStorage` | host plan H2 |
| **Phone permission and in-app-browser coaching** | Build | controller design C2 |
| **Safety card** | Build | controller design section 6 |
| **Funnel counters** | Count on the server, no external analytics (section 9) | below |
| **Spare controllers** | Two or three cheap phones to lend to people with no gyro, low battery or a locked-down browser | hardware list |
| **Offline resilience** | The game must still run if the internet drops: LAN mode keeps working; assets are local | existing behaviour |
| **A dress rehearsal** | A full run of the booth with strangers in a similar space before the event | controller stress plan L5 |

**Hosting recommendation (6 November):** a hosted relay on one small VM in a Mumbai-area region with automatic HTTPS and a real domain as the primary; a booth-laptop offline fallback on a real hostname with a real certificate; the tunnel for emergencies only. Full detail, code changes and the region-by-measurement method are in [plan.md §5h.14.1](../../plan-history.md#5h141-hosting). Time check: Devcon 6 November, **21 days 6 November**; stand up a staging instance this week and freeze the build on 6 November.

**The hosting decision cannot wait.** The audit found the Dockerfile and a share-tunnel script but no deployed instance. A stable URL, a domain and an account are needed well before the event; the temporary tunnel changes address every time and is not a plan for a booth.

## 7. The kit

Screen: a 43-55 inch TV or monitor (two if possible: one for play, one for "how it works"). Computer: a laptop with a decent GPU, plugged in, power settings set to never sleep, and the browser set not to throttle background tabs. Network: a travel router plus a phone hotspot with a data SIM as a second path. Power: a strip, a spare, gaffer tape for cables. Controllers: 2-3 spare phones with chargers. Signage: A3 and A2 prints of the QR with the one-line instruction in English and Hinglish, plus a short URL typed out for people who cannot scan; floor tape to mark a 2 m by 2 m swing zone. Comfort: a small speaker with a volume ceiling, water, wipes for shared phones, a roll of stickers. Safety: a printed rules card (grip firmly, no throwing, clear space, take breaks).

## 8. People and a script

**Roles:** a *greeter* (draws people in, 10-second pitch, hands out cards), a *tech lead* (watches the health screen, fixes problems, never leaves the laptop), and a *floater* (helps people join, manages the queue, resets). Two people at a minimum, three if possible; rotate every two hours.

**The ten-second pitch:** "Scan this with your phone. Your phone is the controller. Swing it. Beat the champion." Nothing about the stack unless they ask.

**If someone asks about the tech:** one sentence ("a browser game; no app, your phone's motion sensors drive it") and the how-it-works screen. If they are a judge, offer the 4-minute demo.

**Kids and groups:** gentle mode on, an adult nearby, the safety card; group play goes to the split-screen games.

## 9. Measuring it (locally, no external analytics)

The server keeps simple counters and shows them on a staff-only page: scans (room joins), permission granted, ready, rounds started, rounds completed, rematches, queue length, median scan-to-ready time, failures by type (permission denied, in-app browser, full room, old build), peak simultaneous phones, health checks. **Targets for a good event:** scan-to-ready median under 20 s; join success over 90%; round completion over 90%; rematch rate over 40%; at least one round running at all times during open hours; zero stuck rooms. These are starting guesses to be replaced by what the first hours show.

## 10. Runbook (what to do when it breaks)

| Symptom | First action | Then |
| --- | --- | --- |
| QR scans but the page will not load | Check the hosted instance's health page; switch the signage to the backup URL | Fall back to LAN plus the travel router |
| Venue Wi-Fi is isolating clients | Ignore it: use mobile data to the hosted URL | Keep the hotspot as the laptop's uplink |
| Phones join but motion does nothing | Show the "use touch instead" button; check the self-test page on a spare phone | Lend a spare phone |
| The TV tab crashed or slept | Reload the host page; the room is reclaimable within 120 s with the saved token | Check sleep settings |
| A stranger is disruptive | Staff kick from the staff phone; lock the room | Reset to attract |
| A crowd forms | The queue handles it; promote spectators; shorten rounds | Add the second screen for spectators |
| A phone is dropped | Safety card, spare phone, no blame | Check for damage |
| The server restarted | Rooms are in memory and will be lost; the TV reclaims or starts a new one; leaderboard persists only if stored | Persist the leaderboard (a task) |

## 11. Before the event: the checklist

1. Email the organisers (section 1 questions). 2. Decide and deploy the hosted instance, domain and certificate. 3. Build Kiosk mode, spectator queue, room hardening, the persistent seat token and the staff controls (host plan: H2, H1, K1, K2, K3, H5a). 4. Build the attract screen, HI-SCORE board and the new controller shell (visual plan V1, V2; controller design C0-C2). 5. Run the controller stress tests on real phones, including a one-hour soak. 6. Run a dress rehearsal with strangers. 7. Print signage; pack the kit; charge everything. 8. Prepare the demo video and the partner write-ups ([plan.md section 12.1](../../plan.md)). 9. Record the funnel counters from the rehearsal so the event targets are realistic.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| No public play area at the hackathon | Confirm early; fall back to a table demo for judges and an online link |
| Venue connectivity is poor | Hosted instance over mobile data; LAN backup; spare hotspot |
| The hosted instance is not ready | Treat it as a blocking dependency with an owner and a date |
| A crowd or a troublemaker overwhelms a booth | Kiosk mode, queue, staff PIN, room lock |
| Phones with no gyro or restricted browsers | Touch mode, spare phones, in-app-browser coaching |
| Injury or a broken phone | Swing zone, safety card, gentle mode, no wide-swing games in rotation |
| Sound complaints | A speaker with a ceiling, captions on-screen, a mute switch |
| Fatigue (36 hours, staff and hackers) | Shifts; short rounds; the self-running kiosk |
| It reads as a toy and not as technology to the hackathon crowd | The how-it-works screen and verified-replay badge |
| Building the booth steals time from the submission | The kit and runbook are prepared before the event; the submission checklist stays on its own track |

## 13. Decisions for the owner

1. **Where will we actually be?** (the organisers' answer decides the plan for audience 2).
2. **Hosting:** account, domain and a deploy date.
3. **Who staffs the booth, and for how long?**
4. **Are we comfortable with a public leaderboard of nicknames** (no personal data) on the screen?
5. **Spare phones:** can we source two or three?
