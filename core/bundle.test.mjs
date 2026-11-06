import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectBundle } from "../scripts/bundle.mjs";
import { games } from "./catalog.js";
function bundle(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chonks-bundle-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "game.json"), JSON.stringify(games[0]));
  fs.writeFileSync(
    path.join(dir, "index.html"),
    "<!doctype html><h1>Test</h1>",
  );
  fs.mkdirSync(path.join(dir, "nested"));
  return dir;
}
test("bundle hash covers nested assets and ignores filesystem iteration order", (t) => {
  const dir = bundle(t);
  const a = inspectBundle(dir);
  assert.equal(a.bundleHash, inspectBundle(dir).bundleHash);
  fs.writeFileSync(path.join(dir, "nested", "art.svg"), "<svg/>");
  const b = inspectBundle(dir);
  assert.notEqual(a.bundleHash, b.bundleHash);
  assert.equal(b.files.length, 3);
});
test("bundle validation rejects nested symlinks, secrets and over-budget content", (t) => {
  const dir = bundle(t),
    link = path.join(dir, "nested", "link");
  fs.symlinkSync(path.join(dir, "index.html"), link);
  assert.throws(() => inspectBundle(dir), /Symlink/);
  fs.unlinkSync(link);
  fs.writeFileSync(path.join(dir, "nested", ".env"), "not-a-secret");
  assert.throws(() => inspectBundle(dir), /Private configuration/);
  fs.unlinkSync(path.join(dir, "nested", ".env"));
  assert.throws(() => inspectBundle(dir, { maxBytes: 1 }), /exceeds/);
});
