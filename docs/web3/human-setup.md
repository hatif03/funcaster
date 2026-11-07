# Owner handoff

Documentation edition: **6 November 2026**.

The integration and XP controller work are now on main. The previous receipt-recovery deployments are complete; do not repeat activation, parent/contract deployment, faucets or expired acceptance commands.

No owner action is needed for the local merged-main check. A fresh public transaction test is still gated by the nearly exhausted ENS operation allowance and the preserved old paid journal. The agent must prepare a concrete guarded continuation and reviewed allowance update before asking the owner to execute it. Keep all original profiles, keys, counters and journals; do not paste their contents.

Merged main `025af597` was deployed to all three services; the relay now runs the separately approved logger PR #6 merge `19d7bc0`. Future pushes do not auto-deploy. Public-chain signing and budget changes remain separately controlled; no journal or cap was reset. Physical phone testing remains the owner’s hardware acceptance.

See [current plan](../../plan.md), [progress](progress.md), [public receipts](market-read-recovery.md) and [historical setup](human-setup-pre-main-history.md).

## Read-only demo terminal

Run `node scripts/demo-terminal.mjs`. It prints canonical Arc/Sepolia transaction links from the public receipt feed, with old evidence labeled RECORDED. The deployed relay emits SIGNING WALLET CONNECTED events after a phone’s signature is validated. A validated public address is shown; keys are created or reused on the phone and never printed.

“ENS allowance” means our cumulative `ENS_MAX_TRANSACTIONS=120` safety cap, not an ENS protocol allowance, domain fee or token approval. The last permitted check counted 118 admitted transactions, before cleanup. A separate 0.05 SepETH gas ceiling also applies. Restarting or deploying preserves both counters.
