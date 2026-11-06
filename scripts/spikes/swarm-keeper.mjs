// G0 prototype for the documented gateway/keeper fallback; no postage purchase.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const GATEWAY = "https://api.gateway.ethswarm.org";
export const digest = (data) => createHash("sha256").update(data).digest("hex");
const validRef = (value) => /^[a-f0-9]{64}$/.test(value);
export async function upload(data, fetcher = fetch) {
  assert(data.byteLength > 0 && data.byteLength <= 5000000);
  const response = await fetcher(GATEWAY + "/bytes", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: data,
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  assert(
    response.ok,
    `Gateway upload HTTP ${response.status}; no automatic retry`,
  );
  const { reference } = await response.json();
  assert(validRef(reference));
  return reference;
}
export async function repair({ reference, data }, fetcher = fetch) {
  assert(validRef(reference), "Only unencrypted public references");
  const read = () =>
    fetcher(`${GATEWAY}/bytes/${reference}`, {
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  let response = await read();
  if (response.ok) {
    assert.equal(
      digest(new Uint8Array(await response.arrayBuffer())),
      digest(data),
      "Hash mismatch: refuse substituted content",
    );
    return { reference, status: "available", sha256: digest(data) };
  }
  assert(
    [404, 410].includes(response.status),
    `Gateway HTTP ${response.status}: retain queue; no upload on an outage or rate limit`,
  );
  assert.equal(
    await upload(data, fetcher),
    reference,
    "Re-upload changed the content reference",
  );
  response = await read();
  assert(response.ok);
  assert.equal(
    digest(new Uint8Array(await response.arrayBuffer())),
    digest(data),
  );
  return { reference, status: "reuploaded", sha256: digest(data) };
}
