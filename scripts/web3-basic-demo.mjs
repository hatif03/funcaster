// One-command local product demo. Explicit MOCK providers; no public signing.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const name of Object.keys(env))
  if (
    /^(ENS_|ARC_|ARKIV_|SWARM_|WEB3_|MARKET_|ROUTER_|CREATOR_|BOUNTY_|STREAM_|TWITCH_|KICK_|GOOGLE_|GATEWAY_|CHECKPOINT_|FEATURE_)/.test(
      name,
    )
  )
    delete env[name];
Object.assign(env, {
  PARTNERS: "mock",
  WEB3_ENS: "mock",
  WEB3_ARC: "mock",
  WEB3_ARKIV: "off",
  MARKETS: "mock",
  COMMERCE: "mock",
  STREAMERS: "off",
  ARC_MEMO: "off",
  WEB3_DATA_DIR: path.resolve(
    root,
    process.env.CHONKS_BASIC_DATA_DIR || ".local/basic-demo",
  ),
});
console.log(
  "Funcaster basic demo: Arc/ENS MOCK, predictions, cheers, creator passes and local records. No real payments.",
);
const children = ["server.js", "scripts/web3-worker.mjs"].map((script) =>
  spawn(process.execPath, [script], { cwd: root, env, stdio: "inherit" }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
for (const child of children) {
  child.once("error", () => {
    console.error("Demo process could not start.");
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}
