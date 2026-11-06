# Conditional multi-party pot

A reusable MIT-licensed contract for two to four parties to lock equal stakes of
an allowed six-decimal token. All parties can agree on the result, or an optional
oracle can propose one subject to a challenge window. A contest or an expired
funding/settlement deadline makes the funded stakes refundable. Payments use pull
claims: a blocked recipient cannot prevent another recipient from claiming.

This is the Arc Studio contract used by Funcaster. It has no administrator, upgrade,
fee, rescue or allowance-funding path. The allowed token list is fixed at
construction. An issuer can still pause or block its token; sending stray tokens
directly to the pot does not create a claim. Read `docs/CONDITIONAL_POT.md` for the
full lifecycle and signature encoding.

## Reproduce locally

From this directory, using the Arc-compatible Foundry already installed in the
repository (or an explicitly installed compatible `forge`):

```sh
bun install --frozen-lockfile --ignore-scripts
../../../.tools/arc-foundry/forge install --no-git foundry-rs/forge-std@rev=bf647bd6046f2f7da30d0c2bf435e5c76a780c1b
../../../.tools/arc-foundry/forge test -vv
```

The dependency is forge-std **1.16.2**, exact commit above. OpenZeppelin is
**5.6.1**, compiler **0.8.28**, EVM **Cancun**, optimizer **200**, fuzz **2,000**
runs. Dependencies and build outputs are ignored; the isolated `bun.lock` pins
the package integrity without touching the repository's root lockfile.

From the repository root, the guarded product rehearsal deploys to a disposable
**loopback Anvil fork only**, using ephemeral fixture keys and public source RPC
reads:

```sh
node scripts/spikes/arc-pot-rehearse.mjs
```

It refuses mutations unless the endpoint is `127.0.0.1`, the chain is `31337`
and the client identifies as Anvil. It never reads the project's role keys or
env files. Its transaction hashes are local evidence, not public receipts.

## Deployment status

The reviewed contract is deployed on Arc testnet at
`0xe339B15Aa54596B4752923d981DAC30B7A569F82`. Its owner-signed creation and
exact artifact were independently checked through both RPC hosts. Service env
files remain MOCK. All 12 public worker checkpoints and the independent
two-host audit pass: 54 worker receipts, eight terminal pots and no unpaid
claims. See
`docs/web3/g1-arc-worker-public.md` at the repository root for completion
evidence and the separate remaining G1 gates. The bounded owner deployment tool is
`scripts/web3-arc-deploy.mjs`; its default is keyless checking. These tests and
readbacks do not constitute an independent professional security audit.
