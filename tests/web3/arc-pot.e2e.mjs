// Run a loopback console built with VITE_CHONKS_POT_ADDRESS=0x222...222.
// All RPC responses below are explicit browser fixtures, never live evidence.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { termsHash } from "../../integrations/arc/signatures.mjs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  parseAbi,
} from "viem";
const opt = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = opt("--base", "http://127.0.0.1:4327/pot/");
assert.equal(new URL(base).hostname, "127.0.0.1");
const abi = JSON.parse(
  await fs.readFile(
    opt("--abi", "integrations/arc/onchain/abi/ConditionalPot.abi.json"),
  ),
);
const out = new URL("../../.local/web3-evidence/arc-pot/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const contract = `0x${"22".repeat(20)}`,
  potId = `0x${"33".repeat(32)}`,
  blockHash = `0x${"44".repeat(32)}`;
const addresses = [1, 2, 3, 4].map((n) => `0x${String(n).repeat(40)}`);
const tokenAbi = parseAbi(["function decimals() view returns(uint8)"]);
const states = {
  funding: 1,
  locked: 2,
  proposed: 3,
  contested: 4,
  settled: 5,
  refunded: 6,
};
const browser = await chromium.launch({ headless: true });
const report = {
  at: new Date().toISOString(),
  scope: "Chromium console UI with explicit RPC fixtures; no chain sends",
  samples: [],
};
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 720],
  ]) {
    for (const scenario of [
      "empty",
      "invalid",
      "funding",
      "locked",
      "proposed",
      "contested",
      "settled",
      "refunded",
      "wrong-chain",
      "unavailable",
      "not-found",
      "stale",
      "details",
      "about",
      "create-empty",
      "create-invalid",
      "create-review",
      "wallet-claim",
      "wallet-refund",
      "wallet-create",
      "wallet-rejected",
      "wallet-account-change",
    ]) {
      const page = await browser.newPage({ viewport: { width, height } }),
        errors = [],
        methods = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        ({ scenario, account, contract }) => {
          window.__walletCalls = [];
          window.ethereum = {
            request: ({ method, params }) => {
              window.__walletCalls.push({ method, params });
              if (method === "eth_requestAccounts")
                return Promise.resolve([account]);
              if (method === "eth_accounts")
                return Promise.resolve([
                  scenario === "wallet-account-change" ? contract : account,
                ]);
              if (method === "eth_chainId") return Promise.resolve("0x4cef52");
              if (method === "eth_sendTransaction") {
                if (scenario === "wallet-rejected")
                  return Promise.reject(
                    Object.assign(new Error("User rejected request"), {
                      code: 4001,
                    }),
                  );
                return Promise.resolve(`0x${"99".repeat(32)}`);
              }
              return Promise.reject(
                new Error(`Unexpected fixture wallet request: ${method}`),
              );
            },
          };
        },
        { scenario, account: addresses[0], contract },
      );
      const time = BigInt(Math.floor(Date.now() / 1000));
      const stateScenario = scenario.startsWith("wallet-")
        ? scenario === "wallet-refund"
          ? "contested"
          : "settled"
        : scenario;
      await page.route("https://rpc.testnet.arc.io/**", async (route) => {
        const request = route.request().postDataJSON();
        const reply = (q) => {
          methods.push(q.method);
          if (scenario === "unavailable")
            return {
              jsonrpc: "2.0",
              id: q.id,
              error: { code: -32000, message: "Fixture RPC unavailable" },
            };
          let result;
          if (q.method === "eth_chainId")
            result = scenario === "wrong-chain" ? "0x1" : "0x4cef52";
          else if (q.method === "eth_blockNumber") result = "0x64";
          else if (q.method === "eth_getCode") result = "0x60006000";
          else if (q.method === "eth_getBlockByNumber")
            result = {
              number: "0x64",
              hash: blockHash,
              timestamp: `0x${(scenario === "stale" ? time - 60n : time).toString(16)}`,
              baseFeePerGas: "0x4a817c800",
              gasLimit: "0x1c9c380",
              gasUsed: "0x0",
              transactions: [],
              parentHash: blockHash,
            };
          else if (q.method === "eth_getTransactionReceipt")
            result = {
              transactionHash: q.params[0],
              transactionIndex: "0x0",
              blockHash,
              blockNumber: "0x64",
              from: addresses[0],
              to: contract,
              cumulativeGasUsed: "0x10000",
              gasUsed: "0x10000",
              effectiveGasPrice: "0x4a817c800",
              contractAddress: null,
              logs: [],
              logsBloom: `0x${"00".repeat(256)}`,
              status: "0x1",
              type: "0x2",
            };
          else if (q.method === "eth_call") {
            const call = q.params[0];
            if (call.data.startsWith("0x313ce567"))
              result = encodeFunctionResult({
                abi: tokenAbi,
                functionName: "decimals",
                result: 6,
              });
            else {
              const decoded = decodeFunctionData({ abi, data: call.data });
              if (
                ["not-found", "create-review", "wallet-create"].includes(
                  scenario,
                ) &&
                decoded.functionName === "getPot"
              )
                return {
                  jsonrpc: "2.0",
                  id: q.id,
                  error: {
                    code: 3,
                    message: "execution reverted",
                    data: encodeErrorResult({ abi, errorName: "UnknownPot" }),
                  },
                };
              if (decoded.functionName === "getPot")
                result = encodeFunctionResult({
                  abi,
                  functionName: "getPot",
                  result: {
                    asset: "0x3600000000000000000000000000000000000000",
                    stake: 500000n,
                    seats: addresses,
                    fundedBitmap: stateScenario === "funding" ? 3 : 15,
                    acceptedBitmap: stateScenario === "funding" ? 3 : 15,
                    rule: 1,
                    oracle: addresses[3],
                    fundDeadline: time + 180n,
                    settleDeadline: time + 900n,
                    challengeWindow: 120,
                    minPlaySeconds: 60,
                    lockedAt: time - 100n,
                    termsHash: potId,
                    metadataHash: blockHash,
                    state: states[stateScenario] ?? 2,
                    proposal: {
                      placesHash: potId,
                      resultHash: blockHash,
                      at: scenario === "proposed" ? time - 10n : 0n,
                    },
                    total: 2000000n,
                  },
                });
              else if (decoded.functionName === "claimableOf")
                result = encodeFunctionResult({
                  abi,
                  functionName: "claimableOf",
                  result: ["settled", "refunded"].includes(stateScenario)
                    ? 500000n
                    : 0n,
                });
              else if (decoded.functionName === "eip712Domain")
                result = encodeFunctionResult({
                  abi,
                  functionName: "eip712Domain",
                  result: [
                    "0x0f",
                    "ChonksPot",
                    "1",
                    5042002n,
                    contract,
                    `0x${"00".repeat(32)}`,
                    [],
                  ],
                });
              else if (decoded.functionName === "hashTerms")
                result = encodeFunctionResult({
                  abi,
                  functionName: "hashTerms",
                  result: termsHash(decoded.args[0], decoded.args[1]),
                });
              else if (decoded.functionName === "isAllowedAsset")
                result = encodeFunctionResult({
                  abi,
                  functionName: "isAllowedAsset",
                  result: true,
                });
              else if (
                ["claim", "refund", "create"].includes(decoded.functionName)
              )
                result = "0x";
              else
                throw Error(`Unexpected fixture call: ${decoded.functionName}`);
            }
          } else throw Error(`Unexpected fixture RPC: ${q.method}`);
          return { jsonrpc: "2.0", id: q.id, result };
        };
        await route.fulfill({
          json: Array.isArray(request) ? request.map(reply) : reply(request),
        });
      });
      await page.goto(
        base +
          (scenario === "about"
            ? "?view=about"
            : scenario.startsWith("create-") || scenario === "wallet-create"
              ? "?view=create"
              : scenario === "empty"
                ? ""
                : `?pot=${scenario === "invalid" ? "bad-link" : potId}`),
      );
      const selector =
        scenario === "about"
          ? "about-page"
          : scenario.startsWith("create-") || scenario === "wallet-create"
            ? "create-page"
            : scenario === "empty"
              ? "pot-empty"
              : scenario === "invalid"
                ? "pot-invalid"
                : ["wrong-chain", "unavailable", "not-found", "stale"].includes(
                      scenario,
                    )
                  ? "pot-error"
                  : "pot-summary";
      await page.getByTestId(selector).waitFor({ timeout: 30000 });
      if (scenario === "details")
        await page
          .getByText("Deadlines and contract details", { exact: true })
          .click();
      assert.deepEqual(
        await page.evaluate(() => window.__walletCalls),
        [],
        "Read-only pages never request a wallet",
      );
      if (
        ["create-invalid", "create-review", "wallet-create"].includes(scenario)
      ) {
        for (const [id, value] of Object.entries({
          potId,
          stake: scenario === "create-invalid" ? "1.1234567" : "0.5",
          "seat-0": addresses[0],
          "seat-1": addresses[1],
          oracle: addresses[2],
          fundDeadline: String(time + 180n),
          settleDeadline: String(time + 900n),
          challengeWindow: "120",
          minPlaySeconds: "60",
          metadataHash: blockHash,
        }))
          await page.locator(`#${id}`).fill(value);
        await page.locator("#asset").selectOption("usdc");
        await page.locator("#rule").selectOption("TOP2_70_30");
        if (scenario === "create-invalid")
          await page.getByTestId("stake-error").waitFor();
        else {
          await page.getByTestId("terms-review").waitFor();
          await page.getByTestId("check-terms").click();
          await page
            .locator('[data-testid="check-result"][data-status="ok"]')
            .waitFor();
        }
      }
      if (scenario.startsWith("wallet-")) {
        await page.getByTestId("connect-wallet").click();
        await page.getByTestId("wallet-account").waitFor();
        if (scenario === "wallet-create")
          await page.getByTestId("create-submit").click();
        else if (scenario === "wallet-refund")
          await page.getByTestId("refund-button").click();
        else
          await page
            .getByRole("button", { name: "Claim for seat 1", exact: true })
            .click();
        await page
          .getByTestId("tx-status")
          .filter({
            hasText:
              scenario === "wallet-account-change"
                ? /account changed/
                : scenario === "wallet-rejected"
                  ? /rejected/i
                  : /confirmed/i,
          })
          .waitFor({ timeout: 15000 });
        const calls = await page.evaluate(() => window.__walletCalls);
        const sends = calls.filter((c) => c.method === "eth_sendTransaction");
        assert.equal(
          sends.length,
          scenario === "wallet-account-change" ? 0 : 1,
        );
        if (sends.length) {
          const tx = sends[0].params[0];
          assert.equal(tx.to.toLowerCase(), contract);
          assert.equal(tx.from.toLowerCase(), addresses[0]);
          const action = decodeFunctionData({ abi, data: tx.data });
          assert.equal(
            action.functionName,
            scenario === "wallet-create"
              ? "create"
              : scenario === "wallet-refund"
                ? "refund"
                : "claim",
          );
          assert(BigInt(tx.maxFeePerGas) >= 20_000_000_000n);
          assert.equal(BigInt(tx.maxPriorityFeePerGas), 0n);
          assert(!tx.value || BigInt(tx.value) === 0n);
        }
        assert(
          !calls.some((c) => /switch|addEthereum|signTyped/.test(c.method)),
        );
      }
      assert.match(
        await page.getByTestId("play-money-label").innerText(),
        /PLAY MONEY/,
      );
      const layout = await page.evaluate(() => {
        const overflow = [...document.querySelectorAll("main *")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.left < -1 ||
                r.right > innerWidth + 1 ||
                (e instanceof HTMLElement &&
                  e.tagName !== "INPUT" &&
                  e.scrollWidth > e.clientWidth + 2 &&
                  getComputedStyle(e).display !== "inline"))
            );
          })
          .map((e) => ({
            tag: e.tagName,
            testId: e.getAttribute("data-testid"),
            text: e.textContent.slice(0, 50),
          }));
        const controls = [
          ...document.querySelectorAll("button,input,select,summary,nav a"),
        ]
          .map((e) => ({
            e,
            r: (e.matches('input[type="checkbox"]')
              ? e.closest("label")
              : e
            ).getBoundingClientRect(),
          }))
          .filter(({ r }) => r.width && r.height);
        const overlaps = [];
        for (let i = 0; i < controls.length; i++)
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i].r,
              b = controls[j].r;
            if (
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
            )
              overlaps.push([
                controls[i].e.textContent.slice(0, 30),
                controls[j].e.textContent.slice(0, 30),
              ]);
          }
        return {
          overflow,
          overlaps,
          shortControls: controls
            .filter(({ r }) => r.height < 43)
            .map(({ e }) => e.textContent),
        };
      });
      assert.deepEqual(errors, [], `${scenario} page errors`);
      assert.deepEqual(layout.overflow, [], `${scenario} ${width} overflow`);
      assert.deepEqual(layout.overlaps, [], `${scenario} overlapping controls`);
      assert.deepEqual(layout.shortControls, [], `${scenario} touch targets`);
      assert(!methods.some((m) => /send|sign|wallet/i.test(m)));
      if (
        (width === 390 &&
          [
            "settled",
            "contested",
            "unavailable",
            "create-review",
            "about",
            "wallet-claim",
          ].includes(scenario)) ||
        (width === 1280 && scenario === "settled")
      )
        await page.screenshot({
          path: new URL(`${scenario}-${width}.png`, out).pathname,
          fullPage: true,
        });
      report.samples.push({
        width,
        height,
        scenario,
        status: "PASS",
        ...layout,
      });
      await page.close();
    }
  }
  report.ok = true;
} finally {
  await browser.close();
  await fs.writeFile(
    new URL("report.json", out),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(`PASS ${report.samples.length} pot-console browser cases`);
