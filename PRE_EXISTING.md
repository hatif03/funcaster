# Pre-existing work and this implementation

The local project was cloned from `https://github.com/hatif03/web3-multiplayer-games`. The comparison base for this feature branch is commit `71b9b26d8157dea6ade012d998fc5e6c2fb3a8fe`. The retained MIT license credits Patrick Sun. This record describes code provenance, not an assertion that all historical assets share that license.

## Already present at that base

The Node/Socket.IO relay, standalone console menu and phone remote, motion/pointer engine, ten original game folders, Three.js rendering and game-rule tests. The kart prototype included extracted character/course/UI/audio fixtures and an asset pipeline. Those files and their history are inherited work.

## Added on `codex/hackathon-party-experience`

The walk-up QR party, any-network temporary HTTPS workflow, calibrated minimal phone controls, gentler landscape racing, three new party games, reconnecting rooms, shared catalog and mode contracts, multiplayer adapters and views, turn-based golf and seeded computer golfers, shared and independent slicing modes, human duels, Drawing’s private prompts and guesses, group rotation, playlists, results/replay records, original kart drivers/models/icons/branding/synthesized audio, display snapshots, diagnostics, SDK/template/isolated preview, validation, CI and deployment preparation.

The latest continuation expands the party branch after commit `8bd3e44`, which had already introduced gentler saved racing sensitivity. Implementation is delivered through draft PR #1, without merging the backend.

## Public asset boundary

The active kart renderer constructs original robot drivers, vehicles, course presentation and items with code and SVG. It does not fetch the historical extracted character/course/audio/font packs. The server returns 404 for the extracted asset paths and pipeline; the container excludes the legacy packs. Some internal IDs and URLs remain for compatibility with existing rules and tests.

The historical fixtures are retained locally for provenance and regression tests. They are not the public release’s artwork. Stable hosting, a final launch tag and physical-device acceptance remain pending. No partner-track integration is included in this pass.
## 2026-11-06 — Web3 foundation baseline (S0)

Main `404abb1` passes `npm run check` on macOS / Node v22.17.0: 313 unit, 106 party and 168 OS tests (587 total). Full output: [baseline-check.txt](docs/web3/baseline-check.txt). The documented Windows CRLF catalog and symlink EPERM failures were not observed here. No baseline failures were fixed.

