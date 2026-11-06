import { decodeFunctionData, decodeEventLog, namehash } from "viem";
import abi from "./lifecycle-abi.json" with { type: "json" };
import { createHierarchyReader } from "./hierarchy.mjs";
import { checkedName } from "./names.mjs";
import { request, readRecord } from "./lifecycle-calls.mjs";
import { requireEns } from "./errors.mjs";
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

export function createEnsReads({
  client,
  protocol,
  parent,
  owner,
  hierarchy = createHierarchyReader({ client, protocol, parent }),
}) {
  function partyName(value) {
    const name = checkedName(value);
    requireEns(
      name.split(".").length === 4 && name.endsWith(`.play.${parent}`),
      "INVALID_NAME",
      "Expected a table name under the configured parent",
    );
    return name;
  }
  async function canonical(proof) {
    requireEns(
      same(
        (await client.getBlock({ blockNumber: proof.blockNumber })).hash,
        proof.blockHash,
      ),
      "REORG",
      "ENS read changed block",
    );
  }
  async function join(value) {
    const name = partyName(value),
      proof = await hierarchy.walk(name, {
        expectedOwner: owner,
        requireResolver: true,
      });
    requireEns(
      same(proof.leaf.owner, owner),
      "OWNER_MISMATCH",
      "Table is not owned by this registrar",
    );
    const at = { blockNumber: proof.blockNumber },
      read = (key) => readRecord(client, proof.leaf.resolver, name, key, at);
    const [version, code, relay] = await Promise.all([
      read("chonks.v"),
      read("chonks.code"),
      read("chonks.relay"),
    ]);
    requireEns(
      version === "1" && /^[A-Z0-9]{4,8}$/.test(code),
      "INVALID_RECORD",
      "Table join records are invalid",
    );
    let url;
    try {
      url = new URL(relay);
    } catch {
      requireEns(false, "INVALID_RECORD", "Invalid table origin");
    }
    requireEns(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash,
      "INVALID_RECORD",
      "Table origin must be HTTPS",
    );
    await canonical(proof);
    return {
      name,
      code,
      origin: url.origin,
      expiresAt: String(proof.expiresAt),
      blockNumber: String(proof.blockNumber),
    };
  }
  async function roster(values) {
    requireEns(
      Array.isArray(values) &&
        values.length >= 1 &&
        values.length <= 4 &&
        new Set(values).size === values.length,
      "INVALID_ROSTER",
      "Expected one to four unique seat names",
    );
    const names = values.map(checkedName),
      party = partyName(names[0].split(".").slice(1).join("."));
    requireEns(
      names.every((n) => n.split(".").length === 5 && n.endsWith(`.${party}`)),
      "INVALID_ROSTER",
      "Seats belong to different tables",
    );
    const head = await client.getBlock({ blockTag: "latest" }),
      seats = [];
    for (const name of names) {
      const proof = await hierarchy.walk(name, {
        expectedOwner: owner,
        requireResolver: true,
        blockNumber: head.number,
      });
      const table = proof.nodes.find((n) => n.name === party);
      requireEns(
        table &&
          same(table.owner, owner) &&
          same(proof.leaf.resolver, table.resolver),
        "INVALID_ROSTER",
        "Seat resolver differs from its table",
      );
      const address = await readRecord(
        client,
        proof.leaf.resolver,
        name,
        undefined,
        { blockNumber: head.number },
      );
      requireEns(
        same(address, proof.leaf.owner) &&
          !seats.some((s) => same(s.address, address)),
        "INVALID_ROSTER",
        "Seat address differs from ownership or duplicates another seat",
      );
      seats.push({ name, address, expiresAt: String(proof.expiresAt) });
    }
    await canonical({ blockNumber: head.number, blockHash: head.hash });
    return {
      party,
      seats,
      blockNumber: String(head.number),
      blockHash: head.hash,
    };
  }
  async function history({ name: value, registrationTx, cursor }) {
    const name = partyName(value);
    requireEns(
      /^0x[\da-fA-F]{64}$/.test(registrationTx || ""),
      "INVALID_HISTORY",
      "A party registration transaction is required",
    );
    const play = await hierarchy.walk(`play.${parent}`, {
      expectedOwner: owner,
      requireResolver: true,
    });
    const receipt = await client.getTransactionReceipt({
        hash: registrationTx,
      }),
      tx = await client.getTransaction({ hash: registrationTx });
    requireEns(
      receipt.status === "success" &&
        same(tx.hash, registrationTx) &&
        same(receipt.transactionHash, registrationTx) &&
        tx.value === 0n &&
        tx.blockNumber === receipt.blockNumber &&
        tx.chainId === protocol.chainId &&
        same(tx.from, owner) &&
        same(tx.to, play.leaf.subregistry) &&
        same(tx.blockHash, receipt.blockHash),
      "INVALID_HISTORY",
      "History creation transaction is not a registrar write",
    );
    const birth = await client.getBlock({ blockNumber: receipt.blockNumber });
    requireEns(
      same(birth.hash, receipt.blockHash),
      "REORG",
      "History creation receipt is not canonical",
    );
    const call = decodeFunctionData({ abi: abi.registry, data: tx.input });
    requireEns(
      call.functionName === "register" &&
        call.args[0] === name.split(".")[0] &&
        same(call.args[1], owner),
      "INVALID_HISTORY",
      "Creation transaction is for another table",
    );
    const resolver = call.args[3];
    requireEns(
      same(
        await client.readContract(
          request("factory", protocol.contracts.factory, "verifyContract", [
            resolver,
          ]),
        ),
        protocol.contracts.resolverImpl,
      ),
      "UNTRUSTED_RESOLVER",
      "History resolver has another implementation",
    );
    const registered = receipt.logs.some((log) => {
      if (!same(log.address, play.leaf.subregistry)) return false;
      try {
        const e = decodeEventLog({
          abi: abi.registry,
          data: log.data,
          topics: log.topics,
        });
        return (
          e.eventName === "LabelRegistered" &&
          e.args.label === call.args[0] &&
          same(e.args.owner, owner) &&
          same(e.args.sender, owner)
        );
      } catch {
        return false;
      }
    });
    requireEns(
      registered,
      "INVALID_HISTORY",
      "Creation receipt lacks the expected registration event",
    );
    const head = await client.getBlock({ blockTag: "latest" });
    requireEns(
      cursor === undefined ||
        (typeof cursor === "string" && /^\d{1,20}$/.test(cursor)),
      "INVALID_HISTORY",
      "Invalid history cursor",
    );
    const to = cursor === undefined ? head.number : BigInt(cursor);
    requireEns(
      to <= head.number && to >= receipt.blockNumber,
      "INVALID_HISTORY",
      "History cursor is outside this table's lifetime",
    );
    const from =
      to - 99n > receipt.blockNumber ? to - 99n : receipt.blockNumber;
    const recordId = await client.readContract(
      request("resolver", resolver, "getRecordId", [namehash(name)]),
    );
    const rows = [];
    let count = 0;
    for (let first = from; first <= to; first += 10n) {
      const logs = await client.getLogs({
        address: resolver,
        event: abi.resolver.find(
          (e) => e.type === "event" && e.name === "TextUpdated",
        ),
        args: { recordId },
        fromBlock: first,
        toBlock: first + 9n < to ? first + 9n : to,
        strict: true,
      });
      count += logs.length;
      requireEns(
        count <= 200,
        "HISTORY_LIMIT",
        "History response exceeds the bounded page limit",
      );
      for (const log of logs)
        if (
          !log.removed &&
          log.args.key === "chonks.receipt" &&
          /^(0x)?[\da-f]{64}$/.test(log.args.value)
        )
          rows.push({
            resultHash: log.args.value,
            tx: log.transactionHash,
            blockNumber: String(log.blockNumber),
            blockHash: log.blockHash,
            logIndex: log.logIndex,
          });
    }
    rows.sort((a, b) =>
      BigInt(a.blockNumber) < BigInt(b.blockNumber)
        ? 1
        : BigInt(a.blockNumber) > BigInt(b.blockNumber)
          ? -1
          : b.logIndex - a.logIndex,
    );
    await canonical({ blockNumber: head.number, blockHash: head.hash });
    return {
      name,
      registrationTx,
      rows,
      nextCursor: from > receipt.blockNumber ? String(from - 1n) : null,
      source: "rpc",
      independentlyVerified: false,
    };
  }
  return { join, roster, history };
}
