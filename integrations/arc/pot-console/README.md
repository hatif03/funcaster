# Funcaster Pot console

Studio-generated Pot, Create and About pages, with the locally reviewed changes
recorded in `docs/web3/g1-arc-contract-console.md` at the repository root. The
console uses a blue Funcaster window theme and persistent PLAY MONEY labels. It is
served at `/pot/`; `?pot=0x…` opens a pot without requesting a wallet.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run lint
bun run build
```

Build before starting the relay. Its existing partner router serves this actual
`dist/` when partners are enabled. No contract address is supplied by default, so
pot reads and creation honestly show unconfigured states. Only after a verified
owner deployment should the operator build with the public
`VITE_CHONKS_POT_ADDRESS`. No private keys belong in Vite variables.

From the repository root, `node tests/web3/arc-pot-dist.e2e.mjs` checks the
unconfigured production build through the actual relay router. It starts and
stops its own loopback server and forbids external browser requests.

For the richer fixture matrix, start this console separately:

```sh
VITE_CHONKS_POT_ADDRESS=0x2222222222222222222222222222222222222222 bun run dev --host 127.0.0.1 --port 4327 --strictPort
```

Then run `node tests/web3/arc-pot.e2e.mjs` from the repository root. That address
is exclusively a browser-test fixture. The test intercepts RPC replies and
installs an in-memory wallet; it never sends to a chain. Do not use that address
in a product build. Screenshot and report output is under
`.local/web3-evidence/arc-pot/`.

Reads verify a fresh canonical block and the configured testnet signing domain.
Create, Refund and Claim require explicit wallet actions. Creation repeats the
on-chain terms comparison at submission; every send rechecks the account,
network and block. Transaction fees use a 20-gwei minimum and 100-gwei maximum,
with zero priority fee. Wrong chains, stale data and account changes stop the
action. Network switching has its own explicit button. The console does not
claim an independent Ledger verification or implement the future relay API.

Dependencies are isolated by the checked-in `bun.lock`. The raw Studio source
hashes are in `../studio/G1-EXPORT.json`. Local changes include the loopback Vite
server, Arc-Testnet-only chain registry, canonical read/send guards, concurrency
guards, compact layout and tests. No analytics or remote fonts are loaded.
