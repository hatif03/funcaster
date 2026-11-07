# Main integration check

Documentation edition: **6 November 2026**.

PR #5 merged at `41854df`; `new-controller-updated` merged at `6d04ab9`. The focused implementation was checked on main at `dc1ee13`. Subsequent edits are documentation and visible page branding only; signed domains and deployed contract names retain their compatible identifiers.

## Bounded results

- 13 catalog entries agree and all game manifests validate after regeneration from the merged catalog.
- 23 focused pad/orientation/phone checks and 10 Web3/controller-context checks pass. The full thousand-test suite was not rerun.
- One isolated relay/worker browser game: two phones joined and received names/simulated funds, two spectators backed opposite outcomes and cheered, Star Catch completed with verified replay and durable Hall result, and simulated predictions/cheers reached verified pull payouts.
- Creator publishing, free demo, simulated room pass and complete earnings claim passed on the same relay.
- The real XP pad component was viewed in a touch-enabled 844×390 browser viewport; press/release and button bounds pass. Screenshots were visually inspected. Creator UI was inspected at 390px.

The one game wrapper returned nonzero after its payout checks because an added `locator.tap()` assertion used persistent browser contexts without `hasTouch`. That test setup issue was isolated and corrected in the separate component check; the financial round was not repeated. This is not an unqualified green end-to-end wrapper result.

## Changes made during integration

The stylesheet conflict retains both phone-stakes and XP pads. Desktop pointer movement and Click/Back/Menu are available in shell mode. Interruptions release held directions, stick and drawing gestures. Drawing maps through the rotated paper coordinates. Generated manifests match their catalog. Visible Web3 page labels match Funcaster while protocol/domain identifiers stay stable.

## Evidence and boundaries

[Report](evidence/main-merge/report.json), [XP pad](evidence/main-merge/xp-pad.png), [creator claim](evidence/main-merge/creator-claim.png). All test payments above are local simulations. Existing public receipt evidence remains in [recovery report](market-read-recovery.md).

No public signer was activated, budget raised, deployed contract replaced or private hosted profile reset during this merge check. After this local check, the owner explicitly requested deployment: relay, worker and verifier successfully deployed main `025af597`. Their configured branch is now main, with automatic deployment still off. New successful public game/cheer/payout/creator-claim acceptance needs a guarded ENS allowance handoff and owner execution. Physical phone acceptance remains open.
