// Separate service entry port: only the B key and B transaction manager belong here.
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { readJson, digest } from "../shared/outbox.mjs";
import { marketRoles, createLiveMarketChains } from "./provider.mjs";
import { processVerifier } from "./store.mjs";
import { resolveMarket } from "./math.mjs";
import records from "../../server/records.cjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const check = (condition, message) => {
  if (!condition) throw Error(message);
};
export async function createMarketVerifierProvider(
  config,
  { transaction, chains, verifyRecord = processVerifier } = {},
) {
  const roles = marketRoles(config),
    key = config.secrets?.MARKET_VERIFIER_KEY;
  check(
    key &&
      same(privateKeyToAccount(key).address, roles.verifierB) &&
      transaction?.transact,
    "Isolated verifier B key and transaction manager required",
  );
  chains ||= await createLiveMarketChains(config);
  return {
    independentJobs: true,
    lookup: async () => null,
    async execute(job) {
      check(
        ["verify.market", "verify.cheer"].includes(job.type),
        "Unsupported verifier task",
      );
      const { marketRef, record } = job.payload || {},
        db = await readJson(
          path.join(config.WEB3_DATA_DIR, "markets", "live-relay.json"),
        ),
        m = db?.markets?.[marketRef],
        result = record?.result;
      check(
        m?.started &&
          m.matchId === result?.matchId &&
          m.game === result.gameId &&
          m.frozenContext.bundleHash === result.bundleHash &&
          m.resultHash === result.hash,
        "Verifier result differs from the frozen relay match",
      );
      const { hash, ...unsigned } = result;
      check(
        records.hash(unsigned) === hash &&
          records.hash(record.replay) === result.replayHash,
        "Verifier canonical hashes differ",
      );
      const winMask = resolveMarket(m.frozenContext.slots, result);
      check(winMask > 0, "Unverified results must expire into refunds");
      const cheer = job.type === "verify.cheer",
        chain = cheer ? chains.cheer : chains.market,
        id = cheer ? marketRef : BigInt(m.chainId),
        s = await chain.snapshot(id),
        players = cheer ? s.params.recipients : s.params.excluded;
      check(
        same(s.params.reporterA, roles.reporterA) &&
          same(s.params[cheer ? "reporterB" : "verifierB"], roles.verifierB) &&
          same(s.params.operator, roles.operator) &&
          players.length === m.seats.length &&
          players.every((a, i) => same(a, m.seats[i].address)),
        "Verifier contract roster or authorities differ",
      );
      const txKey = `room:${digest(marketRef)}:verify:${digest(job.idempotencyKey)}`;
      const prior = (await transaction.receipts({ prefix: txKey })).find(
        (r) => r.id === txKey && r.status === "success",
      );
      let tx = prior?.hash;
      if (!tx) {
        const proof = await verifyRecord({
          marketId: marketRef,
          record,
          slots: m.frozenContext.slots,
          key,
        });
        check(
          same(proof.address, roles.verifierB) &&
            proof.replayed &&
            proof.resultHash === hash &&
            proof.winMask === winMask,
          "Separate replay failed",
        );
        await chain.deployment();
        tx = (
          await transaction.transact(
            txKey,
            chain.call(
              cheer ? "report" : "reportResult",
              [id, `0x${hash}`, cheer ? true : winMask],
              roles.verifierB,
            ),
          )
        ).tx;
      }
      const receipt = await chain.receipt(tx);
      check(
        receipt.events.some(
          (e) =>
            e.eventName === "ResultReported" &&
            same(e.args[cheer ? "tableId" : "marketId"], id) &&
            same(e.args.reporter, roles.verifierB) &&
            same(e.args.resultHash, `0x${hash}`),
        ),
        "Verifier transaction has no matching report event",
      );
      const final = await chain.snapshot(id);
      return {
        mock: false,
        tx,
        explorer: `${chain.deploymentConfig.explorer}/tx/${tx}`,
        data: {
          mode: "on",
          marketRef,
          ...(cheer ? { tableId: marketRef } : { marketId: String(id) }),
          state: Number(final.status),
          blockNumber: final.blockNumber,
          blockHash: final.blockHash,
          chainTime: final.chainTime,
          chainVerified: false,
          outcome: prior ? "reconciled" : "applied",
        },
      };
    },
  };
}
