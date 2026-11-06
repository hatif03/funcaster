"use strict";
/** A temporary public demo. No account, global certificate changes, or router setup. */
const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(__dirname, ".."),
  port = Number(process.env.PORT) || 8444;
const local = path.join(
  root,
  ".tools",
  process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
);
const binary =
  process.env.CLOUDFLARED || (existsSync(local) ? local : "cloudflared");
if (spawnSync(binary, ["--version"], { stdio: "ignore" }).status !== 0) {
  console.error(
    "Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ or put it in .tools/cloudflared, then run npm run share again.",
  );
  process.exit(1);
}
let tunnel,
  server,
  stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  tunnel?.kill("SIGTERM");
  server?.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HTTP: "1", NO_OPEN: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.resume();
server.stderr.on("data", (data) => process.stderr.write(data));
server.on("exit", (code) => {
  if (!stopping) {
    console.error("The game server stopped. The public link is being closed.");
    stop(code || 1);
  }
});
function connect(attempt = 0) {
  const request = http.get(
    `http://127.0.0.1:${port}/api/session`,
    (response) => {
      response.resume();
      if (response.statusCode !== 200) return stop(1);
      if (stopping) return;
      tunnel = spawn(
        binary,
        [
          "--no-autoupdate",
          "tunnel",
          "--url",
          `http://127.0.0.1:${port}`,
          "--protocol",
          "http2",
        ],
        { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
      );
      let announced = false,
        buffer = "";
      const output = (data) => {
        buffer = (buffer + data.toString()).slice(-5000);
        const found = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (found && !announced) {
          announced = true;
          console.log(
            `\n  CHONKS IS READY FOR COMPANY\n\n  Open this on the big screen:\n  ${found[0]}\n\n  The QR on that page works on Wi-Fi or mobile data.\n  Keep this terminal and the big-screen page open.\n  Ctrl+C closes the server and public link.\n\n  This is a temporary demo address, not permanent hosting.\n`,
          );
        }
        if (data.toString().includes("ERR")) process.stderr.write(data);
      };
      tunnel.stdout.on("data", output);
      tunnel.stderr.on("data", output);
      tunnel.on("error", (e) => {
        console.error(e.message);
        stop(1);
      });
      tunnel.on("exit", () => {
        if (!stopping) {
          console.error(
            "The public tunnel closed. Run npm run share to get a new link.",
          );
          stop(1);
        }
      });
    },
  );
  request.setTimeout(2000, () => request.destroy());
  request.on("error", () => {
    if (attempt > 30) return stop(1);
    setTimeout(() => connect(attempt + 1), 200);
  });
}
connect();
