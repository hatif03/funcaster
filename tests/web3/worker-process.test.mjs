import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createOutbox, listJobs } from "../../integrations/shared/outbox.mjs";
test(
  "SIGKILL after an external mock effect recovers the stale lease and executes only once",
  { timeout: 15000 },
  async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), "chonks-worker-kill-")),
      children = [];
    t.after(async () => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const exit = once(child, "exit");
          child.kill("SIGKILL");
          await exit;
        }
      await rm(dir, { recursive: true, force: true });
    });
    const outbox = createOutbox(dir);
    await outbox.enqueue({
      type: "ens.record.set",
      room: "ROOMAA",
      idempotencyKey: "one-effect",
      payload: { hash: "public-fixture" },
    });
    await outbox.close();
    const start = (mode) => {
      const child = fork(
        new URL("./fixtures/crash-worker.mjs", import.meta.url),
        [dir, mode],
        { stdio: ["ignore", "ignore", "ignore", "ipc"] },
      );
      children.push(child);
      return child;
    };
    const first = start("crash");
    assert.equal((await once(first, "message"))[0], "effect-durable");
    const exit = once(first, "exit");
    first.kill("SIGKILL");
    assert.equal((await exit)[1], "SIGKILL");
    const second = start("resume"),
      secondExit = once(second, "exit");
    assert.equal((await once(second, "message"))[0], "done");
    assert.equal((await secondExit)[0], 0);
    assert.equal(
      await readFile(path.join(dir, "effect-count.txt"), "utf8"),
      "effect\n",
    );
    assert.equal((await listJobs(dir)).length, 0);
    const receipts = (await readFile(path.join(dir, "receipts.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].mock, true);
  },
);
