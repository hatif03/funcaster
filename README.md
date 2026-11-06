# Funcaster — your phone, your moves, the whole party

Thirteen browser games for 1–4 phones. Scan the shared screen’s QR, allow motion or choose touch, and play. No account or app installation. **Kart Rush** now has original robot drivers and karts, simultaneous human racers, and a camera for each player.

## Start a party

Requires Node.js **22.12 or newer**, a computer browser with WebGL 2, and phones with Safari or Chrome.

```sh
npm ci
npm run share
```

Open the printed **public HTTPS address on the shared screen**. Its QR works from mobile data or Wi-Fi. `share` needs Cloudflare’s `cloudflared` executable on PATH, in `.tools`, or selected with `CLOUDFLARED`. This checkout has the macOS Apple Silicon executable in the ignored `.tools` directory. The address is temporary; keep the process and host page open. Stable hosting is deliberately pending the user’s choice of account and domain.

For local development, `npm start` serves self-signed HTTPS at `https://localhost:8443`. `HTTP=1 PORT=8556 NO_OPEN=1 npm start` serves a local HTTP preview; a phone on an HTTP LAN address must use touch. Use the trusted share link for visitors.

## Funcaster OS development preview

The new Luna desktop is at `/?shell=os` (or `/os`); use `/?shell=os&demo=1` for a local visual preview without creating a room. The software rebuild is implemented: all 13 Game Properties windows and games, phone pointer/D-pad navigation, pause/results, room tools, boot/attract/staff, skins, helper/audio, street pets and seat avatars. The 234-case viewport matrix and shell flow pass; physical phone/TV acceptance and stable hosting remain pending. The playable fallback stays at `/?shell=classic`. `FUNCASTER_SHELL=os` changes the default root route; the explicit classic query remains available.

Follow [the build specification](docs/plans/build/README.md) and [current progress](docs/OS-BUILD-PROGRESS.md). Generated theme assets live in `assets/os/`; sources under `assets/source/` are never served. Rebuild instructions are in [scripts/os-assets](scripts/os-assets/README.md).

## Games

| Game | Players and controls |
| --- | --- |
| **Kart Rush** | 1–4 drivers; optional CPU field up to eight racers. Landscape wheel tilt, Brake / Boost / Accelerate. |
| **Pocket Greens** | 1–4 golfers plus optional computer opponents. Tilt to aim, hold and release to shoot; 1, 3 or 6 holes. |
| **Slice Dojo** | 1–4; shared-score co-op, competitive shared board or separate boards with the same fruit schedule. |
| **Star Catch** | 1–4; tilt sideways to catch stars. |
| **Neon Drift** | 1–4; landscape steering, pedals and three boosts. |
| **Bubble Burst** | 1–4; tilt to pop, with an optional burst button. |
| **Table Tennis** | Solo versus AI or two humans. Larger crews use Pick two, Winner stays or a bracket. |
| **Foam Fencers** | Solo versus AI or two humans; tilt to guard and tap to strike. Crew rotation available. |
| **Time Trial** | 1–4 separate race views; landscape steering and pedals. |
| **Cloud Cruise** | 1–4 separate flight views; tilt to bank, climb and dive. |
| **Shooting Range** | 1–4 separate boards with the same challenge; aim and tap Fire. |
| **Alien Attack** | 1–4 separate space runs; tilt to dodge and tap Fire. |
| **Drawing** | Solo free draw, 2–4 draw-and-guess with private phone prompts, or four pens on one canvas. |

All games share the same room and connected phones. Multiplayer requires two ready humans; CPU players and spectator screens do not count. Solo preserves the original AI opponents where applicable. Match options freeze when the round starts.

Racing uses gentle progressive steering, a 2° dead zone, and a separate saved sensitivity. **Brake is left, Boost is center, Accelerate is right.** There are three boosts per race/round and an eight-second cooldown. A refresh does not refill them.

## Party features

Playlists, cumulative standings, common results, replay exports, host pause, reconnect identities, mirrored pedals, optional vibration, local best scores, volume and gentle effects. Open a private display invite from **Make it your party** to follow one player, a pair or everyone on another screen. The main host must remain open; displays cannot become the game authority.

`/self-test` checks HTTPS, WebGL, build compatibility, connection round trips and phone motion. `/creator` previews a generated game in an isolated iframe. Community publishing stays disabled until an outside creator completes the SDK trial.

## Development and checks

```sh
npm run check
npm run format:check
npm run test:os
node tests/os/shell.e2e.mjs
node tests/os/viewport.e2e.mjs --smoke
node tests/os/viewport.e2e.mjs
npm run game:create -- my-game
npm run game:validate -- creator-games/my-game
npm run replay:check -- saved-round.json
```

The two browser suites use Playwright Chromium (`npx playwright install chromium` if needed), launch their own isolated local server, and write reports/screenshots under `.local/os-evidence/`. `OS_EVIDENCE_DIR` overrides that directory; `HEADED=1` shows the browser and `OS_BROWSER_CHANNEL` selects a channel. The full viewport run covers 234 solo/max-human samples; `--games=mario-kart,drawing` limits it to selected games. Browser checks are separate from `npm run check`, and do not replace physical sensor or simultaneous-touch testing.

For an event screen, start the relay or hosted endpoint, then use the kiosk launcher:

```sh
npm run kiosk -- --dry-run https://your-console.example/
npm run kiosk -- https://your-console.example/
```

The launcher adds `shell=os`, finds Chrome/Edge, and uses a temporary profile with fullscreen/autoplay flags. `FUNCASTER_URL` supplies a default URL; `FUNCASTER_BROWSER` supplies an absolute executable path. The local dry-run found no installed Chrome/Edge, so actual booth fullscreen/audio still needs rehearsal. This command does not deploy or start the server. Asset regeneration and its Python/FFmpeg requirements are documented in [scripts/os-assets](scripts/os-assets/README.md).

Three party games run their rules on the server. Ten browser games run on the host and send bounded snapshots to read-only displays. Slice Dojo additionally streams its seeded cursor log to a Node checker. Results are labelled `verified` only after a replay agrees; other browser scores remain `attested`.

See [hackathon operation](docs/HACKATHON.md), [SDK](docs/SDK.md), [networking decisions](docs/NETWORKING.md), [release checks](docs/RELEASE.md), and the current status at the top of [plan.md](plan.md). A Dockerfile prepares a single-instance HTTPS deployment; rooms and recent records are in memory.

The historical standalone launcher and remote remain at `/classic.html` and `/classic-controller`. Legacy internal game URLs are preserved. The public kart game uses native procedural models, vector artwork and synthesized sound; extracted legacy assets are blocked from serving and excluded from the container.

## License and provenance

`package.json` declares the MIT license. This tree has no `LICENSE` file and no copyright notice. [PRE_EXISTING.md](PRE_EXISTING.md) distinguishes the inherited game code and fixtures from the party implementation.
