import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { signerBundle } from "../../scripts/web3-build-signer.mjs";
test("committed browser signer equals source and fits the 120 KB gzip budget", async () => {
  const built = await signerBundle(),
    committed = await readFile(
      new URL("../../public/web3/phone-signer.js", import.meta.url),
    );
  assert.ok(committed.equals(Buffer.from(built)));
  assert.ok(gzipSync(built).length < 120000);
});
test("session key is separate from seat storage and persists without rotation", async () => {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const signer =
    await import("../../integrations/shared/phone-signer.src.mjs?fresh");
  const address = signer.loadOrCreateKey(storage);
  assert.ok(/^0x[\da-fA-F]{40}$/.test(address));
  assert.deepEqual([...map.keys()], ["chonks.web3.key"]);
  assert.equal(signer.loadOrCreateKey(storage), address);
  const second =
    await import("../../integrations/shared/phone-signer.src.mjs?reload");
  assert.equal(second.loadOrCreateKey(storage), address);
});
test("phone permission handler remains synchronous and separate from web3 lazy loading", async () => {
  const text = await readFile(
    new URL("../../public/party/phone.js", import.meta.url),
    "utf8",
  );
  const handler = text.slice(
    text.indexOf("function startPlaying()"),
    text.indexOf("function startPlaying()") +
      text
        .slice(text.indexOf("function startPlaying()"))
        .indexOf("const permission = requestMotionPermissions(window);"),
  );
  assert.ok(!/await|web3|import\(/i.test(handler.replace(/\/\/[^\n]*/g, "")));
  assert.match(text, /if \(!state\?\.web3/);
  assert.match(text, /import\("\.\.\/web3\/phone-identity.js"\)/);
});
