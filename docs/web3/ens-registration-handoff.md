# ENS parent registration — completed handoff

**6 November 2026:** the owner ran both commands and independent read-only verification passed. See [registration evidence](ens-evidence.md). No registration action remains. Instructions below are historical.

Original target: **funcaster.eth on Sepolia (11155111), one year**, owner `0x04b0970f4a58caa9E58C5aDBBF7eB402339264a5`. No mainnet purchase. Resolver and subregistry bootstrap are later ENS tasks.

Verified before handoff: 0.77 Sepolia ETH at the registrar; 20 test USDC at the Arc relayer; Arc Studio `whoami` succeeds; funcaster.eth is available; free MockUSDC is accepted by the current oracle; the quoted registration is 8.000021 MockUSDC. The unsigned mint simulation succeeds. The script reads the existing key locally, never prints it, and uses exact-amount approval. The current input caps token cost at 10 MockUSDC and worst-case gas at 0.01 SepETH per transaction.

**Automatic approval review rejected signing/broadcasting twice**, including after evidence established that the tokens have no monetary value. Its reason was that irreversible blockchain transactions require owner execution. No transaction was sent by the agent. The explicit user authorization remains recorded; this is a tool-execution restriction, not missing user permission.

## Run locally

From Terminal on this machine:

```sh
cd /Users/raihankhan/Documents/Projects/web3-multiplayer-games
node scripts/spikes/ens-register-parent.mjs --commit
```

This mints the free test payment tokens, approves the quoted amount, and commits the registration. Wait for `COMMITTED`, then wait **at least 75 seconds** for the on-chain minimum-age window. Run:

```sh
node scripts/spikes/ens-register-parent.mjs --register
```

This submits registration, waits for two confirmations, and verifies owner, expiry, exact registration roles, and denial of the resolver role to an unrelated project key. Success is `REGISTERED`. No key or token needs to be copied or pasted. If it prints `STOPPED`, share that status/error without secrets; pending broadcasts must be reconciled from their hashes before resending.

Read-only verification afterward:

```sh
node scripts/spikes/ens-register-parent.mjs --check
```

Public evidence is written to `docs/web3/spikes/ens-registration.json`; the reveal secret and resumption checkpoint live only in ignored `.local/web3-keys/ens-registration-chonks.json`, mode 0600. The script verifies pinned contract/source metadata, deployed contract links, testnet chain ID and recipient. ABI/source caches already exist in `.tools/web3-spikes` on this machine. These are operator prerequisites, not shipped server code.

The operator script is not a live worker adapter. Registration does not enable ENS or complete all of E0/G0. Resolver/subregistry bootstrap and the remaining live permission, SDK and network checks still follow the plan.
