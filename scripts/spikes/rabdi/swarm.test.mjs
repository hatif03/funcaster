import test from "node:test";
import assert from "node:assert/strict";
import { repair } from "../swarm-keeper.mjs";
const data = new TextEncoder().encode("synthetic"),
  reference = "11".repeat(32);
test("keeper repairs missing content once and checks the content address and retrieved bytes", async () => {
  let n = 0;
  const result = await repair({ reference, data }, async () => {
    n++;
    return n === 1
      ? new Response("", { status: 404 })
      : n === 2
        ? Response.json({ reference })
        : new Response(data);
  });
  assert.equal(n, 3);
  assert.equal(result.status, "reuploaded");
});
test("keeper refuses changed hashes, changed references, encrypted references and outage retries", async () => {
  await assert.rejects(
    repair({ reference, data }, async () => new Response("corrupt")),
  );
  for (const status of [429, 500, 502]) {
    let count = 0;
    await assert.rejects(
      repair({ reference, data }, async () => {
        count++;
        return new Response("", { status });
      }),
    );
    assert.equal(count, 1);
  }
  let n = 0;
  await assert.rejects(
    repair({ reference, data }, async () =>
      ++n === 1
        ? new Response("", { status: 404 })
        : Response.json({ reference: "22".repeat(32) }),
    ),
  );
  await assert.rejects(
    repair({ reference: reference + reference, data }, async () => {
      throw Error("Must not call");
    }),
  );
});
