# Arc Studio provenance — 6 November 2026

Owner explicitly authorized app creation in Dia. Created [Funcaster Pot Arc Studio Testnet](https://studio.arc.io/app/3e018243-4be8-4b94-a488-1f69c9401fae): app `3e018243-4be8-4b94-a488-1f69c9401fae`, original thread `d8085a33-7339-4d50-95be-570ca8de1a58`. Exact creation/cleanup prompts: `integrations/arc/studio/G0-PROMPT.md` and `G0-CLEANUP-PROMPT.md`.

## G1 generation and audit completed

On 6 November, CLI 1.2.2 ran the saved `PROMPT.md`/`SPEC.md`, then `G1-AUDIT-PROMPT.md`, in the same app, thread `85ab97c1-da4e-4bb4-97a1-8eebac5ba283`, session `app-3e018243`. Both completed. Generation, compilation and local tests were authorized; deployment/broadcast/funding were prohibited. The completed result contains an empty deployment list. No secret or env file was uploaded.

Public contract/interface/tests/ABI/docs are in `integrations/arc/onchain/`; the product console is in `integrations/arc/pot-console/`. The final raw export SHA-256 manifest is `integrations/arc/studio/G1-EXPORT.json`. Pulling excluded remote agent instructions, credentials, build outputs and deployment scripts. The Studio report is preserved as `integrations/arc/onchain/docs/G1-audit-report.md` and is an AI review, not an independent professional audit.

The interim unbound terms hash and uint128 narrowing were fixed. Final contract sources are unchanged from the completed Studio export. Local tests independently reproduced **177 Foundry passes**, **273** contract/relay payout matches and **17 actual Arc-fork checks / 54 local transactions** for both assets. Exact dependencies/compiler and source provenance are in the [acceptance handoff](g1-arc-contract-console.md).

The exported UI was further reviewed locally: loopback Vite, Arc-Testnet-only registry, fresh canonical reads, domain/account revalidation immediately before sends, bounded fees, single-action locks, clearer copy, collapsible lookup/details and no template tracking. **219 console tests**, TypeScript, lint and build pass. Real Chromium covers **88 fixture cases plus 12 compiled-console/router cases**, with screenshots visually inspected. The configured fixture address and wallet only exist in test runs; the product build is unconfigured. The G0 diagnostic remains unchanged.

Studio retained an availability finding: permissionless pot ids can be squatted before creation. A4 must reconcile identical existing terms, reject conflicting ones and require new acceptance for replacement terms. The plan's generic ABI is preserved; public operation remains disabled until worker integration and acceptance. Physical phones, real browser-wallet approval, public product receipts and hosted operation remain unverified.

## Preserved G0 diagnostic

This is a read-only G0 diagnostic, not the pot contract. CLI deployment list is empty. Public source was pulled to `integrations/arc/g0-console/`, explicitly excluding `.env`, remote agent instructions and deployment scripts. No private key, token, signature or env file was uploaded.

Review removed template telemetry, tracing, sharing and unused chain helpers/dependencies; corrected future funding docs to `receiveWithAuthorization`; pinned viem 2.57.14; restricted the chain to 5042002; pinned balance/decimals to one observed block. Studio retained `allowedHosts: true` for its preview; the exported local Vite config was hardened to loopback and does not retain that bypass. Attribution is a normal footer, not a floating overlay.

Local `bun install --frozen-lockfile --ignore-scripts`, `bun run check` and `bun run build` pass: **56 tests plus TypeScript**, main JS 433.68 KB (136.49 KB gzip). Real Chromium checks **16 cases** at 320×568, 390×844, 844×390 and 1280×720, covering live public reads, wrong chain, RPC failure and the largest balance. No horizontal/text overflow, runtime page errors or mutating RPC methods. Refresh target at least 44 px. Phone/desktop screenshots were visually inspected; physical mobile browsers are not claimed tested.

Reproduce: run `bun run preview --host 127.0.0.1 --port 4318` in the exported app, then `node tests/web3/arc-g0.e2e.mjs` from the repo. [Report](spikes/arc-g0-browser.json), [phone](spikes/arc-g0-phone.png), [desktop](spikes/arc-g0-desktop.png). UI evidence shows the live post-probe 19.946771 USDC balance. A2 ConditionalPot implementation, the required 40+ contract tests, A7 integration and deployment remain pending. Diagnostic tests are not counted as contract tests.
