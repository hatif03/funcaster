"use strict";
const { existsSync, mkdtempSync } = require("node:fs");
const { join, isAbsolute } = require("node:path");
const { tmpdir, homedir } = require("node:os");
const { spawn } = require("node:child_process");
function candidates(platform, env = process.env) {
  if (env.CHONKS_BROWSER) return [env.CHONKS_BROWSER];
  if (platform === "darwin")
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      join(
        homedir(),
        "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
    ];
  if (platform === "win32")
    return [
      join(
        env.PROGRAMFILES || "C:\\Program Files",
        "Google/Chrome/Application/chrome.exe",
      ),
      join(
        env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
        "Microsoft/Edge/Application/msedge.exe",
      ),
      join(
        env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local",
        "Google/Chrome/Application/chrome.exe",
      ),
    ];
  return (env.PATH || "/usr/bin:/usr/local/bin")
    .split(":")
    .flatMap((dir) =>
      [
        "google-chrome",
        "google-chrome-stable",
        "microsoft-edge",
        "chromium",
        "chromium-browser",
      ].map((name) => join(dir, name)),
    );
}
function kioskUrl(value, env = process.env) {
  const url = new URL(
    value ||
      env.CHONKS_URL ||
      `${env.HTTP === "1" ? "http" : "https"}://localhost:${Number(env.PORT) || 8443}/`,
  );
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP(S) console URL without embedded credentials.");
  url.searchParams.set("shell", "os");
  return url.href;
}
function launchSpec({
  platform = process.platform,
  env = process.env,
  url,
  profile,
  exists = existsSync,
} = {}) {
  const executable = candidates(platform, env).find(exists);
  if (!executable)
    throw new Error(
      "Chrome or Edge was not found. Set CHONKS_BROWSER to its executable path.",
    );
  if (env.CHONKS_BROWSER && !isAbsolute(executable))
    throw new Error("CHONKS_BROWSER must be an absolute executable path.");
  const target = kioskUrl(url, env);
  const args = [
    "--kiosk",
    "--start-fullscreen",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-session-crashed-bubble",
    "--disable-infobars",
  ];
  if (/msedge|microsoft.edge/i.test(executable))
    args.push("--edge-kiosk-type=fullscreen");
  args.push(target);
  return { executable, args, url: target, profile };
}
function main(argv = process.argv.slice(2)) {
  const dry = argv.includes("--dry-run"),
    url = argv.find((arg) => !arg.startsWith("--"));
  const profile = dry
    ? join(tmpdir(), "chonks-kiosk-PREVIEW")
    : mkdtempSync(join(tmpdir(), "chonks-kiosk-"));
  const spec = launchSpec({ url, profile });
  if (dry) {
    console.log(JSON.stringify(spec, null, 2));
    return;
  }
  console.log(
    `Opening Funcaster kiosk: ${spec.url}\nTemporary browser profile: ${profile}\nClose the kiosk with Alt+F4 (Windows/Linux) or Command+Q (macOS).`,
  );
  const child = spawn(spec.executable, spec.args, {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  child.on("error", (error) => {
    console.error(`Could not launch kiosk: ${error.message}`);
    process.exitCode = 1;
  });
  child.unref();
}
module.exports = { candidates, kioskUrl, launchSpec };
if (require.main === module)
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
