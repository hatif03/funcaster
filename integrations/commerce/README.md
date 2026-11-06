# Creator commerce: focused G2 slice

`/commerce/` is the first-party Creator Studio phone/desktop page. Set `COMMERCE=mock` for the local flow. It signs short-lived, exact-payload requests with the existing browser key and supports immutable publishing, collaborator splits, a free two-minute demo, room passes, creator/referral links, earnings and independent claims. The server persists the subset in a local atomic JSON archive. Existing external creator review, immutable bundles and sandboxing are unchanged.

Every simulated payment, balance and claim is marked **MOCK**; there is no fabricated transaction hash. `COMMERCE=on` uses the live HTTP → durable job → guarded worker → independently verified receipt path. It stays unavailable until the owner deploys RevenueRouter and supplies its verified pin. UI links return to the authenticated controller or Funcaster. The host-selected version is checked by the relay against bound room players; query values do not grant host or payer authority. The root integration enforces demo expiration during a round.

## Economics and scope

- USDC only, six decimals. EURC is deferred for this commerce slice because a USD-denominated free threshold needs an explicit conversion rule. Existing Arc pot EURC support is unaffected.
- Guide **24 §4.3 / CP15 supersedes the earlier per-game wording**: a creator's first 1,000 test USDC of lifetime gross is platform-fee free across all their versions/games. The crossing payment charges only its above-threshold portion.
- Standard platform fee is 10%, creator-brought 5%, hard cap 15%. Venue is 10% of gross when present; an attributed referral is 5–20% of gross. Creator/collaborator shares split the remainder. Integer dust belongs to the creator. Nothing is paid out from wagers or predictions.
- Frozen version data includes trusted first-party game metadata, creator, price, collaborator weights, venue/referral recipient and rates. Code changes require a new version. Local metadata is not represented as ENS registration or public-chain registration.
- A 24-hour pass is bound on chain to an exact published version, buyer and room; one confirmed buyer unlocks the room for all its bound players. A free demo is granted once per buyer/version/room for 120 seconds. A repeated payment ID is idempotent; changed terms under the same ID are rejected.
- Claims are recipient-specific and use fixed destinations. A blocked recipient cannot prevent another recipient's claim.

## Arc Studio provenance and remaining live gate

Separate app: [Funcaster creator commerce](https://studio.arc.io/app/7beefb8a-83bc-4c91-9055-a7190f08190e), session `chonks-commerce-g2`. `STUDIO-PROMPT.md` requests code generation and local tests only. `STUDIO-CORRECTIONS.md` records the financial/source review. The A4 app was not modified. No public deployment, signing, funding or broadcast was performed.

After the reviewed source export and local acceptance, a pause was requested for this dedicated Studio sandbox. No completed remote test-suite result is claimed; acceptance below was independently run locally. Local browser/test servers were closed.

The reviewed source is exported at `studio/contracts/RevenueRouter.sol` and `RevenueRouter.artifact.json`. **SHA-256: `527ea3af2d1482183255fa173f6f97a55560bb7b929ff1de9b1bab16ceb5c949`.** Local compilation uses Solidity 0.8.28, Cancun, optimizer 200, and `via_ir=true` (the corrected allocation otherwise reaches Solidity's stack limit). The local Foundry configuration reuses the existing pinned Arc/OpenZeppelin dependencies; it contains no RPC or deployment target.

Four compact independent Solidity acceptance tests pass: free-band gross splits/conservation, cross-version 70/10/10/10, partial-threshold/payment replay, and blocked-recipient isolation. The larger in-progress Studio fixture rewrite is not imported as a claimed passing suite. The source and ABI/EIP-712 type strings are independently checked by `commerce-artifact.mjs`.

Public activation still needs an owner-operated capped deployment, dual-RPC runtime/domain verification, a real pass and independent pull claim. The live HTTP/worker code is now implemented and locally exercised. `chain.mjs` checks two RPC hosts, pinned runtime/domain/immutable settings, exact signatures, balances, guarded transactions and canonical event receipts. It receives the **shared** `createArcTransactions` manager's `transact`/`receipts` methods so Arc, markets and commerce share nonce and spending limits. Recovery checks recorded hashes before expiry/balance/nonce preconditions and never resends uncertain transactions. Signing helpers bind the room/version/payment, attribution, asset and fixed recipient, preserve a 0.05-USDC floor, and use five-minute authorizations. No public acceptance is claimed.

`deployment.mjs` exports `prepareCommerceDeployment({operator,platform})`: exact unsigned constructor calldata `[USDC, platform, operator]`, artifact/source hashes, runtime template and immutable references. The recommended separate deployment gas cap is 0.12 test USDC; the owner's combined deployment runner must estimate and enforce its actual cap before signing.

Live intents and statuses use shared async `readJson`/`atomicJson`, so the configured PostgreSQL document store persists them across Render services and restarts; local fallback remains available. Mutations are serialized and persisted before HTTP acknowledgements. The relay must be a single writer under the root storage lock. Queued/failed/mock evidence never grants a paid pass. The browser retains pending operation IDs across response loss and displays actual explorer links only after receipt verification. Unsigned preparations can safely refresh after expiry; submitted operations cannot silently change terms or obtain a replacement payment ID.

RPC traffic shares a five-second, single-flight canonical snapshot/read cache per chain port. Writes force fresh preflight, receipt checks advance to the mined block, and paid-room access refreshes at ten-second intervals with a thirty-second freshness bound. An unavailable or inconsistent proof closes paid access.

## Focused checks

```
node --test tests/web3/commerce.test.mjs tests/web3/commerce-live.test.mjs
node scripts/commerce-browser.mjs
node scripts/commerce-browser.mjs --live-fixture
.tools/arc-foundry/forge test --root integrations/commerce/studio
node scripts/commerce-artifact.mjs
```

**Validation:** thirteen Node tests, four Solidity acceptance tests, and both browser flows pass. The browser exercises publish → free demo → pass → visible split → earnings → claim at 320, 390, 844 and 1280 pixels, including controller return. The `--live-fixture` run uses the actual live HTTP/signature/job/status/UI code with an isolated deterministic chain port; it is not public acceptance. Screenshots stay under ignored `.local/commerce-browser/` and `.local/commerce-browser-live-fixture/`. No test broadcasts publicly.

Root wiring: `createCommerce({directory, mode, platformAddress, venueAddress, firstPartyGames, onReceipt})` returns `{router, service}`. Mount the router at `/api/commerce`, page at `/commerce/`. `service.access({versionId,roomCode,buyer})` is a gate result, not authentication: supply the room's bound identity. `service.receipts()` supports restart-safe local Ledger indexing.

For `mode:on`, also inject `{dataDir,outbox,chain,deployment,readJobReceipt}`. Call `service.poll()` from the relay tick and `close()` at shutdown. The status endpoint also polls; calls coalesce. Worker namespace `commerce` uses `createCommerceJobProvider({chain,dir})`; allow jobs `commerce.register/pay/claim` and sanitize output using `commerceReceiptData(type,payload,data)`. `chain` is keyless in the relay and receives the shared signer transaction manager only in the explicitly activated worker. Build the browser message helpers with `esbuild integrations/commerce/browser-signatures.mjs --bundle --minify --format=esm --target=es2022 --outfile=public/commerce/signing.js` after editing their source.
