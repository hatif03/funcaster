# Funcaster

Motion-controlled games for the browser — the player's phone is the remote. A
Node/Socket.io relay streams phone IMU data over the LAN to a game running on the
PC. See **README.md** for the architecture and the hard-won gotchas.

## Layout

```
server.js         Socket.io relay + static serving. Auto-discovers games/.
public/           Launcher (index.html) + the shared phone controller.
games/<slug>/     One folder per game, each with its own index.html.
```

A game is any folder under `games/` containing an `index.html`. No registry to
edit — the server scans on boot. `game.json` (title/tagline/emoji) is optional
and only feeds the launcher card.

Slice Dojo (`games/fruit-ninja/`) was reverse-engineered from a demo video; its
`SPEC.md` / `PROMPT.md` live in `games/fruit-ninja/`.
Source: https://www.instagram.com/reel/DZiAyThpC63/

## Goals and direction (read before changing UI)

The goal is a walk-up, phone-controlled browser game console that strangers can start in about 20 seconds and play with friends, shown on a TV and operable entirely from a phone. Since 6 November 2026 the interface is being rebuilt as the **Funcaster** Windows-XP-style desktop over a pixel-art Mumbai wallpaper, with a universal phone remote, a mascot and a backdrop per game. Start at **plan.md** (the North star section), then `docs/plans/build/README.md` (the build specification).

Owner decision: the supplied Windows asset pack (`assets/source/winxp`) and the CraftPix packs are used as supplied (the owner confirmed their licences allow free use) and are committed under `assets/source/`; the build generates the shippable subset into `assets/os/`. The server must not serve `/assets/source`. The implementation spec is `docs/plans/build/README.md`.

**Current integration (6 November 2026 edition).** Main includes Arc/ENS workers, PostgreSQL, the XP desktop and the updated touch-first controller. Read `ARCHITECTURE.md`, `plan.md`, `ARC-JUDGES.md` and `ENS-JUDGES.md`. Historical plans are not current deployment instructions.

## Things that will bite you

- **Sensors need HTTPS.** Browsers block motion sensors on insecure origins and
  Chrome does it silently — listeners attach, no error, no events. `npm start`
  serves HTTPS with a self-signed cert. `HTTP=1` is mouse-only.
- **Never send orientation `volatile`.** Socket.IO drops volatile packets when
  the transport isn't writable, which on long-polling is most of the time.
- **Don't reduce the mapping back to raw Euler angles.** Aim is measured in a
  calibrated frame built from the player's actual grip; the naive version breaks
  entirely for anyone holding the phone upright.

## Working agreement

The owner explicitly approved merging PR #5 and `new-controller-updated` into main. New backend work still requires PR delivery and specific merge approval. Public signing/activation stays owner-operated; merging source does not deploy signer services. Preserve private journals, protected unrelated files and supplied asset licences.
