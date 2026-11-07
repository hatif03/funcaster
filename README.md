# Funcaster — a party console in your browser

Documentation edition: **6 November 2026**.

Thirteen games on a TV or laptop, with 1–4 phones as controllers. Scan the QR, join, and play. The Windows-XP-style desktop and landscape phone pads come from `new-controller-updated`; Arc and ENS integration is now on `main`.

**Try the deployed build:** [funcaster.onrender.com](https://funcaster.onrender.com). Deployment revisions are pinned independently of Git: merging main does not automatically update the hosted signer services.

**Judges:** [Arc guide](ARC-JUDGES.md) · [ENS guide](ENS-JUDGES.md) · [Architecture](ARCHITECTURE.md) · [Current plan](plan.md).

## Run locally

Requires Node.js 22.12+ and a browser with WebGL 2.

```sh
npm ci
npm run start:basic
```

Open `https://localhost:8443/?shell=os`. This starts a relay and worker with explicit simulated Arc/ENS providers, local durable data and no public transactions. It does not load private env files. For a localhost-only touch preview:

```sh
HTTP=1 PORT=8794 NO_OPEN=1 npm run start:basic
```

For trusted HTTPS on phones, `npm run share` uses Cloudflare's `cloudflared`. Open its public URL on the shared screen so the QR works on any network. Motion requires trusted HTTPS. `npm start` alone runs the normal server; `/?shell=classic` keeps the classic dashboard reachable, while `/?shell=os&demo=1` previews the desktop without a room.

## Controller and games

The Luna-blue XP controller supplies per-game buttons, joysticks, drawing paper and touch pointer navigation. Gameplay uses landscape controls with a rotated-page fallback. Slice Dojo and Foam Fencers retain optional motion; most games use touch directly. Escape pauses a round. Racing includes steering, accelerator, brake, and three boosts with an eight-second cooldown.

Games: Kart Rush, Pocket Greens, Slice Dojo, Star Catch, Neon Drift, Bubble Burst, Table Tennis, Foam Fencers, Time Trial, Cloud Cruise, Shooting Range, Alien Attack and Drawing. Solo is preserved; multiplayer starts with two ready humans and supports up to four. Phones, room setup and score verification remain separate from financial authority.

## Arc and ENS

- **Arc testnet:** sponsored test-USDC funding, optional game stakes through ConditionalPot, spectator winner predictions, equal-seat cheers, and creator publishing/passes/revenue claims. A separate verifier checks replay results before reporting market outcomes.
- **ENS on Sepolia:** `funcaster.eth`, party names beneath `play.funcaster.eth`, phone-bound seat names, scoped host authority and a restricted `players.funcaster.eth` namespace. Product issuance of earned player handles still needs acceptance.
- **PostgreSQL on Render:** application documents, payment jobs, signer recovery records, canonical game records and a receipt hash chain. Rooms remain in memory; a relay restart ends a live table but preserves saved payments.

Open **Start → Funcaster Live**; spectators use `/predict`, creators `/commerce/`, and records `/records/`. Local simulated balances are visibly marked. A confirmed receipt badge means two RPC hosts agree on the transaction receipt; it does not independently prove every game outcome.

Public funding, party/seat names, creator registration/pass and two predictions are verified. The stopped prediction round was refunded. A complete successful hosted game→cheer→payout→creator-claim attempt remains open; do not replay the expired acceptance journal. See [deployment evidence](docs/web3/market-read-recovery.md) and [current progress](docs/web3/progress.md).

## Development

```sh
npm run catalog:check
npm run validate:games
node --test public/party/pads.test.mjs tests/party/orientation.test.mjs
npm run game:create -- my-game
npm run replay:check -- saved-round.json
```

`npm run check` is the complete regression suite; use focused checks during small changes. Browser smoke checks use Playwright. Physical iPhone/Android multitouch, sensor permissions and venue-network testing remain distinct from browser automation.

See [SDK](docs/SDK.md), [networking](docs/NETWORKING.md), [startup research](docs/plans/startup/README.md), and [desktop build specification](docs/plans/build/README.md). Supplied source artwork is not served from `/assets/source`; generated assets are in `assets/os/`. Legacy internal URLs and storage keys remain for compatibility. Software is [MIT licensed](LICENSE); upstream notices are preserved.
