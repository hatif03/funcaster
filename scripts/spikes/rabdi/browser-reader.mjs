import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { asc } from "@arkiv-network/sdk/query";
export async function readPublic() {
  const c = createPublicClient({
    chain: rabdi({ accessKey: "" }),
    transport: http(undefined, { retryCount: 0, timeout: 15000 }),
    cacheTime: 0,
  });
  if ((await c.getChainId()) !== 7794095) throw Error("Wrong chain");
  const page = await c
    .select({ $key: true, $creator: true })
    .createdBy("0xE581E56c592Ab9D6d3D234168EE9a89032273c00")
    .orderBy(asc("$key"))
    .limit(10)
    .fetch();
  return { count: page.entities.length, block: String(page.blockNumber) };
}
window.readPublic = readPublic;
