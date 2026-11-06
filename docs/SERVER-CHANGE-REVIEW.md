# Approved server changes

The user explicitly approved this scope on 6 November 2026 after the original automatic review requested confirmation. The implementation is in this tree. No deployment has occurred.

## Concrete next implementation

1. **Revocable phone administration:** keep the TV owner token private; assign a separate, limited grant to an already-seated player, with a five-second TV consent window. Revoke on removal/leave; deduplicate command sequences. Never authorize by room code alone.
2. **Staff and kiosk controls:** opt-in Kiosk mode, salted/hashed staff PIN with unlock rate limits, explicit staff grants, a waiting queue and between-round promotion. Remote screens default off in Kiosk mode.
3. **Room outcomes:** preserve a seat through a short drop; record explicit leave as forfeiture, host removal without a penalty, and a lost match authority as no contest. Freeze the participant set and apply catalog round caps/finish windows.
4. **Persistence and exposure:** bounded leaderboard/funnel storage with no raw motion, origin checks compatible with same-origin HTTPS proxying, payload/rate limits, and regression tests for room isolation and reconnects.

These changes let authorized phones start/pause/end games and change who occupies seats or receives a result. Incorrect checks could grant control to another player or interrupt a live room; incorrect ranking could penalize someone who briefly disconnects. Implement and review each numbered area separately, with opt-in feature flags and existing four-phone tests retained. Delivery is by PR only, without merging or deploying.

Prepared but unexecuted source is retained locally in `/private/tmp/arcade.cjs` and `/private/tmp/funcaster-arcade-install.py`. It is a proposal, not validated production code; it must be reviewed and split before application. This document does not itself grant approval.
