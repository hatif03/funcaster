import { readFile } from "node:fs/promises";
import { checkChain, ledgerView } from "../integrations/ledger/store.mjs";
import { verifyReceipt } from "../integrations/ledger/verify.mjs";
const args = process.argv.slice(2),
  option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--journal"))
  throw Error(
    "Usage: node scripts/records-ledger.mjs --journal PATH [--id ID --rpc URL,URL]",
  );
const view = ledgerView(
  checkChain(await readFile(option("--journal"), "utf8")),
);
if (!args.includes("--id")) console.log(JSON.stringify(view, null, 2));
else {
  const row = view.rows.find((item) => item.id === option("--id"));
  if (!row) throw Error("Receipt observation not found");
  const proof = await verifyReceipt(
    row,
    args.includes("--rpc") ? option("--rpc").split(",") : [],
  );
  console.log(JSON.stringify({ id: row.id, tx: row.tx, proof }, null, 2));
  if (proof.status !== "confirmed") process.exitCode = 1;
}
