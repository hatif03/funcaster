import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { candidates, kioskUrl, launchSpec } = createRequire(import.meta.url)(
  "../../scripts/launch-kiosk.cjs",
);
test("kiosk selects OS browser candidates and isolates a fresh profile without bypassing TLS", () => {
  for (const platform of ["darwin", "linux", "win32"]) {
    const env = { PATH: "/usr/bin", PROGRAMFILES: "C:/Program Files" };
    const found = candidates(platform, env)[0];
    const spec = launchSpec({
      platform,
      env,
      url: "https://console.example.test/?shell=classic",
      profile: "/tmp/test-profile",
      exists: (p) => p === found,
    });
    assert.equal(spec.executable, found);
    assert.equal(new URL(spec.url).searchParams.get("shell"), "os");
    assert.ok(spec.args.includes("--user-data-dir=/tmp/test-profile"));
    assert.ok(
      !spec.args.some((arg) =>
        /ignore-certificate|disable-web-security|no-sandbox/.test(arg),
      ),
    );
  }
});
test("kiosk URL and executable validation never interprets a shell command", () => {
  assert.throws(() => kioskUrl("file:///etc/passwd"));
  assert.throws(() => kioskUrl("https://user:secret@example.test/"));
  assert.throws(() =>
    launchSpec({
      env: { CHONKS_BROWSER: "chrome;echo bad" },
      exists: () => true,
    }),
  );
  assert.throws(
    () => launchSpec({ env: {}, exists: () => false }),
    /not found/,
  );
  assert.equal(
    kioskUrl(undefined, { HTTP: "1", PORT: "8556" }),
    "http://localhost:8556/?shell=os",
  );
});
