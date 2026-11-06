import path from "node:path";
import { createArchive } from "../server/local-records/archive.cjs";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--data-dir"))
  throw Error(
    "Usage: node scripts/records-query.mjs --data-dir PATH [--game chonks.star-catch] [--id HASH]",
  );
const archive = createArchive(path.resolve(option("--data-dir")));
const result = args.includes("--id")
  ? await archive.get(option("--id"))
  : await archive.list({
      gameId: args.includes("--game") ? option("--game") : undefined,
      limit: 10000,
    });
console.log(JSON.stringify(result, null, 2));
