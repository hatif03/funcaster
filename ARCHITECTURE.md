# Funcaster technical architecture

Documentation edition: **6 November 2026**.

## Runtime

A single Node/Express/Socket.IO relay serves the XP desktop, games, phone pads and Web3 HTTP APIs. The TV owns its room; phones receive scoped identities and input authority. Inputs travel through `/party`; gyro orientation is never volatile. Some games run server rules; browser games submit bounded replay/result data. Scores are labelled verified only when their replay checker agrees.

The relay is keyless for chain execution. Durable jobs are consumed by a payment worker with separately scoped ENS/Arc roles. A separate market verifier runs with its own key. Live mode requires explicit configuration and pinned contracts; local `start:basic` uses simulations. Public signing and activation remain owner-operated.

## Storage and recovery

Render PostgreSQL stores documents and ordered streams through `integrations/storage/postgres.mjs`. Numeric stream cursors preserve insertion order, and receipt delivery waits for persistence before advancing. Each service has a single writer and persistent disk. Rooms and live Socket.IO connections remain in memory; a relay restart is not seamless game recovery.

The ledger admits only sanitized observations. Live creator payments come from the durable worker receipt stream. Confirmations require independent read-only RPC agreement. Exports preserve replay hashes and producing build identifiers. The ledger covers observed worker receipts, not every historical chain transaction; automatic recovery payments may require public explorer evidence.

## Transaction flow

1. A phone creates and retains its local signing identity. QR joining binds its session to a seat; the relay queues ENS naming and capped test funding.
2. Game stake terms freeze before phone consent. Phones sign typed authorizations; workers validate domain, asset, limits, identities and canonical terms before a sponsored transaction.
3. Spectators authenticate separately and may predict an outcome before the window closes. Seated players cannot bet on their own round. Cheers use a separate equal-seat payout contract.
4. Verified game results feed settlement/reporting. Separate operator/reporter/verifier roles gate outcomes. Unresolved or abandoned markets follow void/refund deadlines; claims are isolated per recipient.
5. Creator versions freeze recipients and splits. A paid pass is scoped to its version/table; earnings are pulled through RevenueRouter. The first $1,000 lifetime creator revenue is fee-free under the current product policy.

## Main modules

| Concern | Code |
|---|---|
| Rooms, host and input | `server/party.cjs`, `public/party/phone.js`, `public/party/pads.js` |
| Desktop and games | `public/os/`, `games/`, `core/`, `sdk/` |
| Web3 orchestration | `server/web3/`, `integrations/shared/` |
| ENS | `integrations/ens/` |
| Game stake pots | `integrations/arc/` |
| Predictions and cheers | `server/market/`, `integrations/market/` |
| Creator revenue | `server/commerce/`, `integrations/commerce/` |
| Durable storage and records | `integrations/storage/`, `server/local-records/`, `integrations/ledger/` |

## Deployment and evidence

[Arc judges](ARC-JUDGES.md) and [ENS judges](ENS-JUDGES.md) give addresses, receipts and demo instructions. [Render operations](docs/web3/render-live.md) describes hosted services. [Plan](plan.md) distinguishes implemented software from remaining live acceptance.
