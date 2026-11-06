"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash, randomBytes } = require("node:crypto");
const { inspectBundle } = require("../scripts/bundle.mjs");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const CHECKS = ["assetRights", "sandbox", "playability"];
class CreatorRegistry {
  constructor(directory) {
    this.root = path.resolve(directory);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(this.root).isSymbolicLink())
      throw Error("Registry cannot be a symlink");
    this.file = path.join(this.root, "registry.json");
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : {
          schemaVersion: 1,
          acceptance: null,
          namespaces: {},
          submissions: [],
          audit: [],
        };
    if (this.state.schemaVersion !== 1)
      throw Error("Unsupported registry version");
  }
  save(event, detail) {
    this.state.audit.push({ event, detail, at: new Date().toISOString() });
    this.state.audit = this.state.audit.slice(-1000);
    const temp = this.file + "." + randomBytes(6).toString("hex");
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temp, this.file);
  }
  namespace(name, owner) {
    if (
      !/^[a-z][a-z0-9-]{1,39}$/.test(name) ||
      ["chonks", "creator", "system"].includes(name)
    )
      throw Error("Choose an unreserved namespace");
    if (typeof owner !== "string" || !owner.trim() || owner.length > 100)
      throw Error("Name the namespace owner");
    if (this.state.namespaces[name])
      throw Error("Namespace already belongs to an owner");
    this.state.namespaces[name] = owner;
    this.save("namespace", name);
  }
  acceptTrial(note) {
    if (
      typeof note !== "string" ||
      note.trim().length < 12 ||
      note.length > 1000
    )
      throw Error(
        "Record who completed the external creator trial and its outcome",
      );
    this.state.acceptance = { note, at: new Date().toISOString() };
    this.save("acceptance", "External creator trial recorded");
  }
  submit(directory, owner) {
    if (this.state.submissions.length >= 200)
      throw Error("Registry capacity reached");
    const bundle = inspectBundle(directory),
      namespace = bundle.gameId.split(".")[0];
    if (this.state.namespaces[namespace] !== owner)
      throw Error("Namespace owner must submit this game");
    if (bundle.manifest.verification !== "casual")
      throw Error("Creator submissions must use casual verification");
    if (
      this.state.submissions.some(
        (s) => s.gameId === bundle.gameId && s.version === bundle.version,
      )
    )
      throw Error("This game version is immutable; increment the version");
    // Read once, verify every byte against inspection, then save only this snapshot.
    const files = bundle.files.map((f) => {
      const source = path.resolve(directory, f.path);
      if (fs.lstatSync(source).isSymbolicLink())
        throw Error("Bundle changed during submission");
      const bytes = fs.readFileSync(source);
      if (sha(bytes) !== f.sha256)
        throw Error("Bundle changed during submission");
      return { ...f, data: bytes.toString("base64") };
    });
    const total =
      this.state.submissions.reduce((n, s) => n + s.bytes, 0) + bundle.bytes;
    if (total > 500 * 1024 * 1024)
      throw Error("Registry storage limit reached");
    const id = randomBytes(12).toString("hex"),
      bundleFile = path.join(this.root, id + ".bundle.json");
    fs.writeFileSync(
      bundleFile,
      JSON.stringify({ manifest: bundle.manifest, files }),
      { mode: 0o600, flag: "wx" },
    );
    const record = {
      id,
      gameId: bundle.gameId,
      version: bundle.version,
      title: bundle.manifest.title,
      owner,
      bundleHash: bundle.bundleHash,
      bytes: bundle.bytes,
      status: "submitted",
      submittedAt: new Date().toISOString(),
    };
    this.state.submissions.push(record);
    this.save("submit", id);
    return structuredClone(record);
  }
  get(id) {
    const r = this.state.submissions.find((s) => s.id === id);
    if (!r) throw Error("Submission not found");
    return r;
  }
  bundle(id) {
    const record = this.get(id),
      b = JSON.parse(
        fs.readFileSync(path.join(this.root, id + ".bundle.json"), "utf8"),
      );
    if (!Array.isArray(b.files) || b.files.length > 4096)
      throw Error("Invalid saved bundle");
    let bytes = 0;
    const paths = new Set();
    const list = b.files.map((f) => {
      if (
        typeof f.path !== "string" ||
        !f.path ||
        f.path.startsWith("/") ||
        f.path.includes("\\") ||
        f.path.split("/").some((p) => !p || p === "." || p === "..") ||
        paths.has(f.path)
      )
        throw Error("Invalid saved path");
      paths.add(f.path);
      const data = Buffer.from(f.data, "base64");
      bytes += data.length;
      if (
        bytes > 25 * 1024 * 1024 ||
        data.length !== f.bytes ||
        sha(data) !== f.sha256
      )
        throw Error("Saved bundle integrity check failed");
      return { path: f.path, bytes: f.bytes, sha256: f.sha256 };
    });
    if (sha(JSON.stringify(list)) !== record.bundleHash)
      throw Error("Saved bundle hash differs");
    return b;
  }
  review(id, { reviewer, note, checks, approved }) {
    const r = this.get(id);
    if (!["submitted", "rejected", "approved"].includes(r.status))
      throw Error("Withdraw a published version before reviewing again");
    if (
      typeof reviewer !== "string" ||
      !reviewer.trim() ||
      reviewer.length > 100 ||
      typeof note !== "string" ||
      note.length < 8 ||
      note.length > 2000
    )
      throw Error("Reviewer and review notes are required");
    if (approved && !CHECKS.every((k) => checks?.[k] === true))
      throw Error(
        "Approve asset rights, sandbox behavior and playability separately",
      );
    this.bundle(id);
    r.status = approved ? "approved" : "rejected";
    r.review = {
      reviewer,
      note,
      checks: Object.fromEntries(CHECKS.map((k) => [k, checks?.[k] === true])),
      at: new Date().toISOString(),
    };
    this.save("review", id);
    return structuredClone(r);
  }
  publish(id) {
    const r = this.get(id);
    if (!this.state.acceptance)
      throw Error("Record the external creator trial before publication");
    if (r.status !== "approved" || !CHECKS.every((k) => r.review?.checks[k]))
      throw Error("This exact bundle needs approval before publication");
    this.bundle(id);
    r.status = "published";
    r.publishedAt = new Date().toISOString();
    this.save("publish", id);
    return structuredClone(r);
  }
  withdraw(id, note) {
    const r = this.get(id);
    if (
      r.status !== "published" ||
      typeof note !== "string" ||
      note.trim().length < 8
    )
      throw Error("Choose a published version and record a withdrawal reason");
    r.status = "withdrawn";
    r.withdrawal = { note, at: new Date().toISOString() };
    this.save("withdraw", id);
  }
  catalog() {
    return this.state.submissions
      .filter((s) => s.status === "published")
      .map((s) => ({
        id: s.id,
        gameId: s.gameId,
        title: s.title,
        version: s.version,
        bundleHash: s.bundleHash,
        verification: "casual",
      }));
  }
}
module.exports = { CreatorRegistry, CHECKS };
