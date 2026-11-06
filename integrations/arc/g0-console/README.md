# Funcaster Pot (G0 scaffold)

A small read-only diagnostic page for the Funcaster Pot project. It reads public data from the Arc Testnet RPC and shows connection status, chain ID, the public relayer address, its USDC balance, the latest block and the last check time. All funds are play money. It does not connect a wallet, sign, or send transactions.

Built with [Arc Studio](https://studio.arc.io)

See [G0.md](./G0.md) for the scope and the planned future work.

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS
- viem 2.57.14 (public client only)
- Vitest and Testing Library

## Development

Prerequisites: [Bun](https://bun.sh).

```bash
bun install
bun run dev      # start the dev server
bun run test     # run the tests
bun run build    # production build
bun run typecheck # type check
bun run lint     # oxlint
bun run check    # tests, then typecheck
```

### Environment variables

All optional, all public values (never put secrets here):

- `VITE_CHONKS_CHAIN_ID`: must be `5042002` if set. Any other value is refused.
- `VITE_CHONKS_RPC_URL`: public https RPC URL (default `https://rpc.testnet.arc.io`).
- `VITE_CHONKS_USDC_ADDRESS`: USDC contract address.
- `VITE_CHONKS_RELAYER_ADDRESS`: public relayer address to inspect.
