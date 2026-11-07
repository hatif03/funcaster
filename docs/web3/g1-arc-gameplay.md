> Historical implementation milestone. Current integrated behavior and remaining tasks are in [architecture](../../ARCHITECTURE.md) and [progress](progress.md); do not execute old activation instructions from this milestone.

# A5/A6 — gameplay and phone integration

6 November 2026. **Implemented; focused local acceptance passes.** Implementation `9f7bf87` on `web3/integrations`, review-only PR #4. Public phone/gameplay acceptance remains open. This does not close G1 or G2.

## What works

- Game Properties → Rules → Stakes: choose 0.50, 1.00 or 2.00 play-USDC and one of the three payout rules. Every player accepts on their own phone. Stakes never enter `room.setup`, the scoreboard key or canonical result.
- The relay freezes the ready human roster and game, resolves the ENS seats, reserves a durable pot ID, then submits the existing worker jobs. Both start gates require a fresh Locked observation and a fresh roster check (five seconds). Changed rules/players and a missing worker block staked starts; cancelling restores unstaked play.
- First bound join schedules per-asset bankroll jobs. Address/device and IP identifiers are salted and kept private. Existing worker budgets, retained balances, journals, kill switch and no-resend controls remain authoritative.
- Phone consent rebuilds the testnet Accept and EIP-3009 messages locally. It limits amounts/assets, binds the terms and saves the consenting pot locally. Full addresses and signatures never enter broadcast room state.
- After a verified game, the phone compares the result with its game state and reconstructs the placement vector. It shows a five-second countdown and Dispute. Auto-agreement only runs while the card and page are visible; reopening gives another five seconds. Once signed, agreement cannot be withdrawn.
- Missing agreements take the existing delayed oracle path. A dispute prevents cooperation, is sent once a proposal exists, then refunds. An unfinished/unverified match or too few remaining humans cannot settle. Funding/settlement timeouts retain their refund obligation even when the host chooses to play without stakes.
- The existing worker collects each payout/refund independently. Phone and desktop results show settlement/claim progress; real pots link to the existing independent `/pot/` console. MOCK output has no transaction hash, explorer link or verified badge.

## Verification

[Check summary](g1-arc-gameplay-check.txt), [browser report](g1-arc-gameplay-browser.json), [desktop](evidence/arc-gameplay/desktop.png), [phone portrait](evidence/arc-gameplay/phone-portrait.png), [landscape](evidence/arc-gameplay/phone-landscape.png).

- `npm run check`: **837 tests pass** — 313 unit, 117 party, 168 OS, 239 Web3. Catalog/game validation and both partner-off parity gates pass.
- Six focused integration tests: fund/lock/start/settle/claims; dispute→proposal→refund; abandonment→deadline refund with no settlement; changed rules/worker outage/cancel; another seat cannot answer a private request; production outbox/worker MOCK interface.
- `tests/web3/arc-phone.e2e.mjs`: actual desktop, two browser phones and a real Star Catch round. The phones use generated session identities and real offline typed signatures; chain effects are explicitly MOCK. Checks consent, start gating, replay-verified result, five-second agreement and both payouts. Phone portrait and landscape overflow is measured.
- Existing A4 evidence still covers the real deployed contract and worker: 12 public checkpoints, 54 two-host receipts and eight terminal pots. That evidence is not relabelled as public gameplay acceptance.

Reproduce with two terminals, an **isolated** temporary data directory, no env files, and `PARTNERS=mock` for both:

```sh
HTTP=1 PORT=8794 NO_OPEN=1 PARTNERS=mock WEB3_DATA_DIR=/tmp/chonks-arc-qa EVENT_STORE=/tmp/chonks-arc-events.json node server.js
PARTNERS=mock WEB3_DATA_DIR=/tmp/chonks-arc-qa node scripts/web3-worker.mjs
```

Then run `node tests/web3/arc-phone.e2e.mjs`. Evidence defaults to `/tmp/chonks-a56-browser-evidence`; use `CHONKS_ARC_EVIDENCE` to choose another output folder. This is browser touch-input testing; HTTP is not a physical motion-sensor test.

## Deliberate limits and next work

- Scope follows the owner's expedited instruction: basic gameplay and essential refund/dispute caveats, not an expanded failure matrix. Physical iPhone/Android motion and multitouch remain owner-deferred.
- Stakes require a replay-verifiable game and exactly two to four ready humans within that game's capacity. Drawing/attested results, computer players and solo are excluded. The baseline desktop offers USDC; the server/signature/worker paths also support configured EURC. Full multi-asset product controls are later UI work.
- Funding cancellation/abandonment refunds at the immutable contract deadline, not immediately. A completed proposal keeps its signed challenge terms. Relay restart loses the room, but durable worker pot records retain deadline refunds and claims; complete phone/room restoration is not claimed.
- The standalone wallpaper demo returns an unavailable explanation; use a local MOCK room for interactive stakes. Phone-only copy lives in a lazy module to retain the existing initial desktop size ceiling. Shared shell copy remains in `public/os/strings.js`.
- **No public transaction, deployment or live-mode activation was performed.** The earlier signing restriction remains in force. Public ENS/phone/console acceptance needs an owner-operated live session after the remaining G1 integrations are ready; do not repeat A4's completed probe or redeploy.
- **Next:** Ledger L1–L4/Memo, then the integrated public match, failure drills and stop-the-relay proof. G2's player UI/creator-commerce slice remains separate and unfinished.

No new account, domain or funding answer blocks the next coding work. No changes to `core/`, `games/`, `sdk/`, `package-lock.json` or `scripts/gen-cert.js`.
