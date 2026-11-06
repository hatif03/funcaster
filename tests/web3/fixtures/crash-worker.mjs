import { appendFile } from "node:fs/promises";
import path from "node:path";
import {
  createWorker,
  mockProvider,
  acquireWorkerLock,
} from "../../../integrations/shared/worker.mjs";
const [dir, mode] = process.argv.slice(2),
  release = await acquireWorkerLock(dir),
  provider = mockProvider(dir);
const worker = createWorker({
  dir,
  providers: {
    ens: {
      ...provider,
      execute: async (job) => {
        await appendFile(path.join(dir, "effect-count.txt"), "effect\n");
        return provider.execute(job);
      },
    },
  },
  afterExecute: async () => {
    if (mode === "crash") {
      setInterval(() => {}, 1000);
      process.send("effect-durable");
      await new Promise(() => {});
    }
  },
});
await worker.poll();
await worker.close();
await release();
process.send("done");
process.disconnect();
