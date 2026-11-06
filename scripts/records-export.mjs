import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createArchive } from "../server/local-records/archive.cjs";
import { checkChain, ledgerView } from "../integrations/ledger/store.mjs";
import { hash } from "../server/records.cjs";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--data-dir") || !args.includes("--out"))
  throw Error(
    "Usage: node scripts/records-export.mjs --data-dir PATH --out NEW_DIRECTORY",
  );
const dataDir = path.resolve(option("--data-dir")),
  out = path.resolve(option("--out"));
// Exclusive directory prevents accidentally overwriting an older audit export.
await mkdir(out);
await mkdir(path.join(out, "records"));
const archive = createArchive(dataDir),
  records = await archive.list({ limit: 10000 });
for (const row of records)
  await writeFile(
    path.join(out, "records", row.id + ".json"),
    JSON.stringify(await archive.get(row.id), null, 2),
  );
let journal = "";
try {
  journal = await readFile(
    path.join(dataDir, "ledger", "journal.jsonl"),
    "utf8",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const chain = checkChain(journal),
  ledger = ledgerView(chain);
await writeFile(path.join(out, "ledger.jsonl"), journal);
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      provenance: "local export; no decentralised storage or external anchor",
      records: records.map((row) => ({
        id: row.id,
        replayHash: row.replayHash,
        bundleHash: row.bundleHash,
      })),
      ledgerHead: chain.head,
      ledgerRows: chain.count,
      digest: hash(records),
    },
    null,
    2,
  ),
);
const data = JSON.stringify({ records, ledger }).replaceAll("<", "\\u003c");
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Funcaster exported records</title><style>body{font:17px system-ui;background:#e8eff9;color:#16314d;max-width:900px;margin:36px auto;padding:20px}article{padding:16px;background:white;border:1px solid #a8bad2;margin:12px 0;border-radius:8px}a{color:#1459b4}code{overflow-wrap:anywhere}h1{font-size:32px}</style><h1>Funcaster · Saved records</h1><p>Offline snapshot. Local results and recorded transaction observations are separate. No relay, wallet or network connection is required to read this page. Receipt badges describe their recorded check time; they are not fresh RPC checks.</p><main id="rounds"></main><h2>Transaction observations</h2><p id="coverage"></p><main id="ledger"></main><p><a href="ledger.jsonl">Download the hash-chain journal</a> · <a href="manifest.json">Export manifest</a></p><script>const data=${data};for(const r of data.records){const a=document.createElement('article'),h=document.createElement('h2'),p=document.createElement('p'),l=document.createElement('a');h.textContent=r.gameId;p.textContent=new Date(r.endedAt).toLocaleString()+' · '+r.status+' · game report: '+r.gameVerification;l.href='records/'+r.id+'.json';l.textContent='Download canonical result + replay';a.append(h,p,l);document.querySelector('#rounds').append(a)}document.querySelector('#coverage').textContent=data.ledger.coverage;for(const r of data.ledger.rows){const a=document.createElement('article');a.textContent=r.type+' · '+(r.mock?'MOCK — no chain':r.verification?.status||'unverified')+' · '+(r.tx||'no transaction');document.querySelector('#ledger').append(a)}</script>`,
);
console.log(
  `Exported ${records.length} canonical rounds and ${ledger.rows.length} transaction observations to ${out}. Verify with node scripts/records-verify.mjs ${out}/records/HASH.json; the exact matching game build is required.`,
);
