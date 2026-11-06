# Local records and receipt ledger

Hosted records use PostgreSQL; local development uses files in the configured persistent data directory. Durable worker receipts replay with persistence backpressure. It does not claim decentralised storage or public-chain proof for game scores.

`createLocalRecords({ dataDir, verificationRpcUrls, isRoomActive })` exposes an Express router, `finish(room, record)`, `recordReceipt(receipt)`, `list`, `get`, `leaderboard`, `ledger`, `flush` and `close`. Mount the router at `/api/records` and `public/records/` at `/records/`. Gameplay hooks enqueue background work; they perform no RPC or filesystem I/O themselves. The queue admits 64 waiting items; rejected work is counted and the UI shows storage needs attention. Graceful shutdown awaits `close()`.

Run one relay writer against a data directory and back it up. A malformed journal fails closed and is never silently rewritten. Canonical blobs are written atomically, keyed by result SHA-256, with a 16 MiB per-round limit. Startup reconstructs summaries from blobs. High scores separate game version, bundle and rules/player count; player slots are round-local identities.

Canonical `matchId` contains the room code. The relay must pass `isRoomActive(code)`: while true, public downloads return 409 and the UI says “Replay available after table closes.” Summaries omit the code. Offline owner exports preserve the original record and hash at any time.

## Provenance

Arc/ENS observations are whitelisted; signatures, tokens, device IDs and IP identifiers are not copied. Mock observations have no transaction hash. Optional RPC URL pairs enable background verification against two different HTTPS hosts. The verifier loads no keys and checks chain ID, transaction hash, matching receipts and the canonical block hash using only JSON-RPC reads.

The badge is **transaction receipt confirmed**, not proof of decoded operation details or a game outcome. Failed, missing, inconsistent and unavailable receipts remain unconfirmed. Checks are timestamped. The local hash chain is not externally anchored; coverage is observed worker receipts rather than a historical chain index.

Local commerce/market/social activities require `mock: true` and no `tx`. Example:

```js
recordReceipt({
  id: "unique-safe-operation-id",
  type: "commerce.pass",
  status: "posted", // done / failed also accepted
  mock: true,
  at: Date.now(),
  data: { amount: "12", asset: "USDC" },
});
```

These become `partner: "local"`, `chainId: null`, never trigger RPC, and display **DEMO · LOCAL ONLY**. They are not Arc payments.

## Export and verify with the relay stopped

From the matching repository build:

```sh
node scripts/records-query.mjs --data-dir .local/web3
node scripts/records-export.mjs --data-dir .local/web3 --out /tmp/chonks-export
node scripts/records-verify.mjs /tmp/chonks-export/records/RESULT_HASH.json
node scripts/records-verify.mjs --ledger /tmp/chonks-export/ledger.jsonl
node scripts/records-ledger.mjs --journal /tmp/chonks-export/ledger.jsonl
```

The export directory must be new. Its self-contained `index.html` opens from disk without the relay. It includes up to 10,000 rounds and the complete journal. Retain the producing game build: verification delegates to the existing replay checker, which refuses mismatched builds and attested games without score verifiers. Hash integrity alone is not score verification.

Fresh read-only verification of an exported transaction, without changing its journal:

```sh
node scripts/records-ledger.mjs --journal /tmp/chonks-export/ledger.jsonl --id OBSERVATION_ID --rpc https://rpc.testnet.arc.io,https://rpc.testnet.arc.network
```

Use two configured Sepolia hosts for ENS. No relay, worker, key or signed operation is needed. Offline journal verification checks local hashes only; this separate command makes fresh public reads.
