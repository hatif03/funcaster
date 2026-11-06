const $ = (selector) => document.querySelector(selector);
const model = { records: [], groups: [], ledger: { rows: [] } };
const query = new URLSearchParams(location.search);
$("#search").value = query.get("tx") || query.get("game") || "";
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const title = (id) =>
  String(id)
    .replace(/^chonks\./, "")
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
const date = (time) =>
  Number.isFinite(time) && time > 0
    ? new Date(time).toLocaleString()
    : "Time unavailable";
const match = (value) =>
  JSON.stringify(value)
    .toLowerCase()
    .includes($("#search").value.trim().toLowerCase());
function empty(container, heading, detail) {
  const card = node("div", undefined, "empty");
  card.append(node("strong", heading), node("span", detail));
  container.append(card);
}
function download(id, text = "Download round + replay ↓") {
  const link = node("a", text, "download");
  link.href = `/api/records/${encodeURIComponent(id)}`;
  return link;
}
function render() {
  const rounds = $("#round-list");
  rounds.replaceChildren();
  for (const round of model.records.filter(match)) {
    const card = node("article", undefined, "card"),
      head = node("div", undefined, "card-head");
    head.append(
      node("h3", title(round.gameId)),
      node("span", "LOCAL REPLAY", "badge local"),
    );
    card.append(
      head,
      node("p", `${date(round.endedAt)} · ${round.status}`, "meta"),
    );
    const scores = node("ul", undefined, "scores");
    for (const score of round.scores)
      scores.append(
        node(
          "li",
          `${score.rank === 1 ? "★ " : ""}Player ${score.slot + 1} · ${score.score}${score.outcome && score.outcome !== "finished" ? ` (${score.outcome})` : ""}`,
        ),
      );
    card.append(
      scores,
      node(
        "p",
        `Game report: ${round.gameVerification}. Hashes checked on local storage.`,
        "receipt-description",
      ),
      download(round.id),
    );
    const details = node("details");
    details.append(
      node("summary", "Record identity & offline verification"),
      node("code", round.id, "hash"),
      node(
        "p",
        "Run node scripts/records-verify.mjs ROUND.json from the exact game build. The relay may be stopped. Attested games verify record integrity only.",
      ),
    );
    card.append(details);
    rounds.append(card);
  }
  if (!rounds.children.length)
    empty(
      rounds,
      "Your next round goes here",
      "Play a round on this console. Its saved result and replay will appear after the background save finishes.",
    );
  const scores = $("#score-list");
  scores.replaceChildren();
  for (const group of model.groups.filter(match)) {
    const card = node("article", undefined, "card");
    card.append(
      node("h3", title(group.gameId)),
      node(
        "p",
        `${group.matches} completed rounds · ${group.direction === "lower" ? "Lower" : "Higher"} scores win · ${group.version}`,
        "meta",
      ),
    );
    const list = node("ol");
    for (const win of group.wins) {
      const item = node("li");
      const link = node(
        "a",
        `${win.score} · Player ${win.slot + 1} · ${date(win.endedAt)}`,
      );
      link.href = `/api/records/${win.record}`;
      item.append(link);
      list.append(item);
    }
    card.append(
      list,
      node(
        "p",
        `Build ${group.bundleHash?.slice(0, 12)} · Rules ${group.rulesHash?.slice(0, 12)}`,
        "meta",
      ),
    );
    scores.append(card);
  }
  if (!scores.children.length)
    empty(
      scores,
      "Set the first high score",
      "Completed rounds with a verified game replay will appear here. Casual and abandoned rounds stay in Saved rounds.",
    );
  const receipts = $("#receipt-list");
  receipts.replaceChildren();
  for (const row of model.ledger.rows.filter(match)) {
    const card = node("article", undefined, "card"),
      head = node("div", undefined, "card-head");
    const status =
      row.partner === "local"
        ? "DEMO · LOCAL ONLY"
        : row.mock
          ? "MOCK · NO CHAIN"
          : row.verification?.status === "confirmed"
            ? "RECEIPT CONFIRMED"
            : (row.verification?.status || "UNVERIFIED").toUpperCase();
    const badgeClass = row.mock
      ? "mock"
      : row.verification?.status === "confirmed"
        ? "confirmed"
        : ["reverted", "rpc-mismatch"].includes(row.verification?.status)
          ? "error"
          : "local";
    head.append(
      node("h3", title(row.type.replaceAll(".", "-"))),
      node("span", status, `badge ${badgeClass}`),
    );
    card.append(
      head,
      node(
        "p",
        `${row.partner === "local" ? "Local demo activity" : row.partner === "arc" ? "Arc testnet" : "Sepolia"} · ${date(row.at)} · ${row.status}`,
        "meta",
      ),
    );
    if (row.data?.name)
      card.append(node("p", row.data.name, "receipt-description"));
    if (row.data?.state)
      card.append(
        node(
          "p",
          `Worker-reported pot state: ${row.data.state}`,
          "receipt-description",
        ),
      );
    if (row.tx) card.append(node("code", row.tx, "hash"));
    else
      card.append(
        node(
          "p",
          row.mock
            ? "Demo effect only. No public transaction was sent."
            : "No transaction reference was provided.",
          "receipt-description",
        ),
      );
    const details = node("details");
    details.append(node("summary", "What this proves"));
    details.append(
      node(
        "p",
        row.verification?.detail ||
          "This is a worker observation. It has not been independently confirmed against two RPC hosts.",
      ),
    );
    if (row.verification?.at)
      details.append(
        node(
          "p",
          `Checked ${date(row.verification.at)} · ${(row.verification.hosts || []).join(" + ")}`,
        ),
      );
    if (row.verification?.blockNumber)
      details.append(
        node("p", `Canonical block at check: ${row.verification.blockNumber}`),
      );
    if (row.tx) {
      details.append(
        node(
          "code",
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [row.tx],
          }),
          "hash",
        ),
      );
      const link = node("a", "Open testnet explorer ↗", "download");
      link.href = `${row.partner === "arc" ? "https://explorer.testnet.arc.io" : "https://sepolia.etherscan.io"}/tx/${row.tx}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      details.append(link);
    }
    card.append(details);
    receipts.append(card);
  }
  if (!receipts.children.length)
    empty(
      receipts,
      "The trail starts with an action",
      "Arc and ENS worker observations appear here. Demo actions are always marked MOCK; they never get a real transaction badge.",
    );
  $("#coverage").textContent =
    `${model.ledger.coverage || "Observed worker receipts only."} Journal rows: ${model.ledger.journalRows || 0}. Head: ${model.ledger.head || "empty"}.`;
  $("#count").textContent =
    `${model.records.length} saved rounds · ${model.ledger.rows.length} transaction observations`;
}
function tab() {
  const selected = ["rounds", "leaderboard", "ledger"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "rounds";
  for (const id of ["rounds", "leaderboard", "ledger"])
    $("#" + id).hidden = id !== selected;
  for (const link of document.querySelectorAll("[data-tab]")) {
    if (link.dataset.tab === selected)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
async function refresh() {
  $("#refresh").disabled = true;
  try {
    const [rounds, board, ledger] = await Promise.all(
      ["", "/leaderboard", "/ledger"].map(async (suffix) => {
        const response = await fetch(`/api/records${suffix}`, {
          cache: "no-store",
        });
        if (!response.ok) throw Error("Records service unavailable");
        return response.json();
      }),
    );
    model.records = rounds.records;
    model.groups = board.groups;
    model.ledger = ledger;
    $("#notice").className = "notice";
    $("#notice").textContent =
      rounds.storage === "attention-needed"
        ? "A background save needs attention. Previously saved records remain available. Ask the console owner to check local storage."
        : "Local storage · Keep a backup or export for lasting access. No blockchain publication is claimed for game records.";
    render();
  } catch {
    $("#notice").className = "notice error";
    $("#notice").textContent =
      "The relay is unavailable. Any rows already shown may be stale. Exported records and the offline Hall still work without it.";
  } finally {
    $("#refresh").disabled = false;
  }
}
$("#search").addEventListener("input", render);
$("#refresh").addEventListener("click", refresh);
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a");
  const pathname = link ? new URL(link.href).pathname : "";
  if (!/^\/api\/records\/[a-f0-9]{64}$/.test(pathname)) return;
  event.preventDefault();
  if (link.getAttribute("aria-busy") === "true") return;
  link.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(pathname, { cache: "no-store" });
    if (!response.ok) {
      const body = await response.json();
      throw Error(
        body.error || "Replay download is unavailable. Try again shortly.",
      );
    }
    const url = URL.createObjectURL(await response.blob());
    const save = document.createElement("a");
    save.href = url;
    save.download = `chonks-round-${pathname.split("/").at(-1).slice(0, 12)}.json`;
    document.body.append(save);
    save.click();
    save.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    $("#notice").className = "notice error";
    $("#notice").textContent =
      error.message || "Replay download is unavailable. Try again shortly.";
    $("#notice").scrollIntoView({ block: "nearest" });
  } finally {
    link.removeAttribute("aria-busy");
  }
});
window.addEventListener("hashchange", tab);
if (query.has("tx") && !location.hash) location.hash = "ledger";
tab();
refresh();
