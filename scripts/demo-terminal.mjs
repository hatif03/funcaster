// Read-only demo console. Shows public evidence; never loads or creates a key.
import { spawn } from "node:child_process";
import readline from "node:readline";
const origin = "https://funcaster.onrender.com";
const seen = new Set();
let stopped = false;
function transaction(row, historical = false) {
  if (!/^0x[\da-f]{64}$/i.test(row.tx || "") || row.mock || seen.has(row.tx))
    return;
  const explorer =
    row.chainId === 5042002
      ? "https://explorer.testnet.arc.io"
      : row.chainId === 11155111
        ? "https://sepolia.etherscan.io"
        : null;
  if (!explorer) return;
  seen.add(row.tx);
  if (
    row.type === "arc.drip" &&
    /^0x[\da-f]{40}$/i.test(row.data?.address || "")
  )
    console.log(
      `${historical ? "RECORDED" : "NEW"} WALLET FUNDED: ${row.data.address}`,
    );
  console.log(
    `${historical ? "RECORDED" : "NEW"} ${/^[a-z.]+$/.test(row.type || "") ? row.type : "TRANSACTION"} | receipt ${["confirmed", "pending", "failed"].includes(row.verification?.status) ? row.verification.status : "observed"}\n  ${explorer}/tx/${row.tx}`,
  );
}
console.log(
  `FUNCASTER LIVE DEMO\n${origin}\nPrivate signing keys stay on each phone. Only public addresses and transaction links appear here.\nThe initial RECORDED entries are earlier evidence; NEW entries arrive as you test.\nCtrl+C stops this read-only monitor.\n`,
);
const render = spawn(
  "render",
  [
    "logs",
    "--resources",
    "srv-dbn3labbc2fs73ebli4g",
    "--text",
    "FUNC_DEMO",
    "--tail",
    "--start",
    new Date().toISOString(),
    "--output",
    "text",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
readline.createInterface({ input: render.stdout }).on("line", (line) => {
  const at = line.indexOf("FUNC_DEMO ");
  if (at < 0) return;
  try {
    const e = JSON.parse(line.slice(at + "FUNC_DEMO ".length));
    // The relay deliberately emits an allowlisted schema. Never forward raw CLI logs.
    if (
      e.mode === "live" &&
      e.event === "wallet-connected" &&
      /^0x[\da-f]{40}$/i.test(e.address || "")
    )
      console.log(
        `SIGNING WALLET CONNECTED: ${e.address} (key created/reused on phone)`,
      );
    else if (
      e.mode === "live" &&
      e.event === "transaction" &&
      /^https:\/\/(explorer\.testnet\.arc\.io|sepolia\.etherscan\.io)\/tx\/0x[\da-f]{64}$/i.test(
        e.url || "",
      )
    ) {
      const hash = e.url.split("/").at(-1);
      if (seen.has(hash)) return;
      seen.add(hash);
      console.log(
        `${e.delivery === "replay" ? "RECORDED" : "NEW"} TRANSACTION | worker observed (explorer verifies chain status)\n  ${e.url}`,
      );
    }
  } catch {}
});
render.on("error", () =>
  console.log(
    "Render log stream unavailable; public receipt monitoring continues.",
  ),
);
render.stderr.on("data", () => {});
render.on("exit", () => {
  if (!stopped)
    console.log(
      "Render log stream ended; public receipt monitoring continues.",
    );
});
let initial = true,
  unavailable = false;
async function poll() {
  try {
    const r = await fetch(origin + "/api/records/ledger", {
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw Error();
    const data = await r.json();
    if (!Array.isArray(data.rows)) throw Error();
    const rows = data.rows;
    if (initial) {
      for (const row of rows.slice(8)) if (row.tx) seen.add(row.tx);
      for (const row of rows.slice(0, 8).reverse()) transaction(row, true);
      initial = false;
      console.log("\nWaiting for phone joins and new public receipts…\n");
    } else for (const row of [...rows].reverse()) transaction(row);
    unavailable = false;
  } catch {
    if (!unavailable)
      console.log(
        "Receipt feed temporarily unavailable; waiting for recovery.",
      );
    unavailable = true;
  }
}
async function stop() {
  stopped = true;
  render.kill("SIGTERM");
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
while (!stopped) {
  await poll();
  if (!stopped) await new Promise((r) => setTimeout(r, 4000));
}
