import { mkdir, readFile, open } from "node:fs/promises";
import path from "node:path";
import { hash } from "../../server/records.cjs";
import { readJsonStream, appendJsonStream } from "../shared/outbox.mjs";

export const GENESIS = "0".repeat(64);
export function checkChain(text) {
  if (text && !text.endsWith("\n")) throw Error("LEDGER_INCOMPLETE_TAIL");
  const rows = text.trim() ? text.trim().split("\n").map(JSON.parse) : [];
  let previous = GENESIS;
  for (const [index, row] of rows.entries()) {
    const { hash: digest, ...body } = row;
    if (
      body.seq !== index + 1 ||
      body.previous !== previous ||
      hash(body) !== digest
    )
      throw Error("LEDGER_INTEGRITY_FAILURE");
    previous = digest;
  }
  return { rows, head: previous, count: rows.length };
}

// Single relay process owns this append-only journal. A malformed/torn tail
// closes the journal instead of silently rewriting its history.
export function createLedgerStore(dataDir, { now = Date.now } = {}) {
  const file = path.join(dataDir, "ledger", "journal.jsonl");
  let state,
    tail = Promise.resolve(),
    fault;
  const ready = (async () => {
    const text = await readJsonStream(file);
    state = checkChain(text);
  })();
  ready.catch(() => {});
  function append(kind, data, key) {
    const next = tail.then(async () => {
      await ready;
      if (fault) throw fault;
      if (key) {
        const prior = state.rows.find((row) => row.key === key);
        if (prior) {
          if (prior.kind !== kind || hash(prior.data) !== hash(data))
            throw Error("LEDGER_KEY_CONFLICT");
          return prior;
        }
      }
      const body = {
        seq: state.count + 1,
        previous: state.head,
        at: now(),
        kind,
        ...(key ? { key } : {}),
        data,
      };
      const row = { ...body, hash: hash(body) };
      try {
        await appendJsonStream(file, row, String(row.seq));
      } catch (error) {
        fault = error;
        throw error;
      }
      state.rows.push(row);
      state.count++;
      state.head = row.hash;
      return row;
    });
    tail = next.catch(() => {});
    return next;
  }
  return {
    file,
    append,
    async snapshot() {
      await ready;
      await tail;
      if (fault) throw fault;
      return structuredClone(state);
    },
    async flush() {
      await ready;
      await tail;
      if (fault) throw fault;
    },
  };
}

const TX = /^0x[\da-f]{64}$/i;
const ADDRESS = /^0x[\da-f]{40}$/i;
export function receiptObservation(receipt) {
  // Commerce worker receipts predate the relay bridge's mode field. Their
  // transaction remains an observation until independent RPC verification.
  const commerceWorkerReceipt =
    /^commerce\.(register|pay|claim)$/.test(receipt?.type) &&
    receipt?.data?.mode === undefined &&
    TX.test(receipt?.tx);
  const publicPayment =
    /^(commerce\.(register|pay|claim)|market\.(create|started|bet|report|finalize|cancel|void|claim)|cheer\.(create|started|contribute|report|cancel|void|claim)|verify\.(market|cheer))$/.test(
      receipt?.type,
    ) &&
    (receipt?.data?.mode === "on" || commerceWorkerReceipt) &&
    receipt.mock !== true;
  const local =
    /^(commerce|market|social)\.[a-z.]+$/.test(receipt?.type) && !publicPayment;
  if (local && (receipt.mock !== true || receipt.tx)) return null;
  if (
    !receipt ||
    !/^(arc|ens|commerce|market|cheer|verify|social)\.[a-z.]+$/.test(
      receipt.type,
    ) ||
    !["done", "failed", ...(local ? ["posted"] : [])].includes(receipt.status)
  )
    return null;
  const partner = local
    ? "local"
    : publicPayment
      ? "arc"
      : receipt.type.split(".")[0];
  const mock = receipt.mock === true || receipt.data?.mode === "mock";
  const data = {};
  // Never copy signatures, session tokens, device/IP identifiers or arbitrary
  // worker metadata into this public read model.
  for (const key of ["potId", "termsHash", "placesHash", "registrationTx"])
    if (TX.test(receipt.data?.[key]))
      data[key] = receipt.data[key].toLowerCase();
  for (const key of ["contract", "address", "registry", "resolver"])
    if (ADDRESS.test(receipt.data?.[key]))
      data[key] = receipt.data[key].toLowerCase();
  for (const key of ["amount", "blockNumber", "registrationBlock"])
    if (/^\d{1,78}$/.test(receipt.data?.[key]))
      data[key] = String(receipt.data[key]);
  for (const key of ["state", "status", "asset", "name"])
    if (typeof receipt.data?.[key] === "string")
      data[key] = receipt.data[key].slice(0, 160);
  const tx = !mock && TX.test(receipt.tx) ? receipt.tx.toLowerCase() : null;
  return {
    id: hash({ id: String(receipt.id || ""), type: receipt.type, tx, mock }),
    type: receipt.type,
    partner,
    chainId: local ? null : partner === "arc" ? 5042002 : 11155111,
    status: receipt.status,
    mock,
    tx,
    at: Number.isSafeInteger(receipt.at) ? receipt.at : 0,
    data,
  };
}

export function ledgerView(snapshot) {
  const receipts = new Map();
  for (const row of snapshot.rows) {
    if (row.kind === "receipt")
      receipts.set(row.data.id, {
        ...row.data,
        journalHash: row.hash,
        verification: null,
      });
    if (row.kind === "verification" && receipts.has(row.data.id))
      receipts.get(row.data.id).verification = row.data.proof;
  }
  return {
    head: snapshot.head,
    journalRows: snapshot.count,
    coverage:
      "Observed worker receipts only; not a complete chain index. Local hash chain is not externally anchored.",
    rows: [...receipts.values()].reverse(),
  };
}
