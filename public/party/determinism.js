import { compareTimelines } from "/core/determinism-run.js";
import { buildId } from "/build.js";
let result;
const $ = (s) => document.querySelector(s);
$("#run").onclick = () => {
  const w = new Worker("/party/determinism-worker.js", { type: "module" });
  $("#run").disabled = true;
  $("#save").disabled = true;
  w.postMessage({ mode: $("#mode").value });
  w.onmessage = (e) => {
    if (e.data.progress) {
      $("progress").value = e.data.progress.round;
      $("#status").textContent =
        `Race ${e.data.progress.round}/20 · ${e.data.progress.fastForwardMs}ms fast-forward`;
    }
    if (e.data.error) {
      $("#status").textContent = e.data.error;
      $("#run").disabled = false;
      w.terminate();
    }
    if (e.data.result) {
      result = { ...e.data.result, buildId, browser: navigator.userAgent };
      $("#status").textContent =
        `Finished · ${result.rounds.filter((r) => r.complete).length}/20 complete. Compare with another browser.`;
      $("#run").disabled = false;
      $("#save").disabled = false;
      w.terminate();
    }
  };
};
$("#save").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(result)], { type: "application/json" }),
  );
  a.download = "chonks-kart-" + result.mode + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("#compare").onclick = () => {
  try {
    const other = JSON.parse($("#baseline").value);
    $("#comparison").textContent = JSON.stringify(
      compareTimelines(result, other),
      null,
      2,
    );
  } catch {
    $("#comparison").textContent =
      "Run this device and paste a valid timeline first.";
  }
};
