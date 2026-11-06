# Retired Studio deployment request

The owner ran the previous prompt on 6 November 2026. Studio reported that it did not deploy, sign or send anything. The prompt incorrectly combined a deployment request with a prohibition on the coding agent submitting it. Studio also reported that its shared-wallet deployment tool could not enforce the fee ceiling, zero priority fee, direct creation shape or no-resend behavior.

Do not rerun that prompt. The replacement is the owner-operated local command documented in `docs/web3/g1-arc-worker.md`:

```sh
node --env-file=.env.worker scripts/web3-arc-deploy.mjs --apply --confirm-arc-a4-deploy
```

It uses the unchanged reviewed Studio artifact pinned by `A4-DEPLOYMENT.json`. The local relayer key stays in the owner process. The command programmatically enforces the 0.1-test-USDC ceiling and saves a two-host-verified deployment pin. The agent may run `node scripts/web3-arc-deploy.mjs --check` for keyless simulation only. The earlier owner-signing restriction remains in force.
