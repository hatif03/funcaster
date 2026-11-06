import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { walkScores, classifyScore, createBoardCache } from "./hall-reader.mjs";
const owner = "0xE581E56c592Ab9D6d3D234168EE9a89032273c00";
const reader = createPublicClient({
  chain: rabdi({ accessKey: "" }),
  cacheTime: 0,
  transport: http(undefined, { retryCount: 0, timeout: 15000 }),
});
const cache = createBoardCache();
const status = document.querySelector("#status");
function render({ rows, stale = false }) {
  const groups = { trusted: [], unverified: [], invalid: [] };
  for (const row of rows) groups[classifyScore(row, [owner])].push(row);
  for (const name of Object.keys(groups))
    document.getElementById(name).textContent = String(groups[name].length);
  const list = document.querySelector("#scores");
  list.replaceChildren();
  groups.trusted
    .sort((a, b) => b.score.value - a.score.value)
    .slice(0, 20)
    .forEach((row, index) => {
      const li = document.createElement("li"),
        label = document.createElement("span"),
        score = document.createElement("strong");
      label.textContent = `${index + 1}. Test player ${row.ordinal.value + 1}`;
      score.textContent = String(row.score.value);
      li.append(label, score);
      list.append(li);
    });
  document.querySelector("#empty").hidden = groups.trusted.length > 0;
  document.querySelector("#empty").textContent =
    "No trusted records in this test run.";
  status.textContent = stale
    ? "Cached scores · refresh pending or network unavailable."
    : "Public records loaded · creator and payload checks complete.";
}
async function refresh() {
  status.textContent = "Reading public records…";
  const run = new URL(location.href).searchParams.get("run");
  if (!/^g0_[0-9]+$/.test(run ?? "")) {
    status.textContent =
      "No completed test run selected. Open the run link from the G0 evidence report.";
    return;
  }
  try {
    const result = await cache(
      run,
      async () => {
        if ((await reader.getChainId()) !== 7794095) throw Error("Wrong chain");
        return walkScores(reader, run);
      },
      render,
    );
    render(result);
  } catch {
    status.textContent =
      "Public network unavailable. Please try again. Existing scores remain visible.";
  }
}
document.querySelector("#refresh").addEventListener("click", refresh);
window.g0Hall = { render, refresh };
