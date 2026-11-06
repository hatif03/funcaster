import { betData, identityData } from "./types.js";
import { fundingIntent } from "./intents.js";
const $ = (id) => document.getElementById(id),
  coins = (value) => (Number(value || 0) / 1e6).toFixed(2);
let token = null,
  identity = null,
  signer = null,
  rows = [],
  selected = null,
  outcome = 0,
  amount = "50000",
  estimate = null,
  moved = false,
  busy = false,
  personal = { positions: [] },
  offset = 0,
  runtimeMode = "mock";
const demo = new URLSearchParams(location.search).get("demo") === "1";
const messages = {
  betting: "Choose your winner. Coins come back if the match is voided.",
  locked: "Predictions are closed. The players are getting ready.",
  live: "The match is on. Good luck to your pick!",
  resolving: "Checking the replay. Payouts follow matching reports.",
  final: "Result confirmed. Collect your winnings below.",
  void: "Coins are refundable. Nobody loses on an unverified result.",
};
async function api(path, body) {
  const response = await fetch(`/api/web3/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Connection unavailable");
  return data;
}
function status(text) {
  $("status").textContent = text;
}
function current() {
  return rows.find((m) => m.marketId === selected);
}
function project(m) {
  if (!m) return null;
  const total = m.outcomes.reduce((s, p) => s + BigInt(p.pool), 0n),
    own = BigInt(m.outcomes[outcome]?.pool || 0),
    x = BigInt(amount);
  return String(x + ((total - own) * x) / (own + x));
}
function button(text, className, click) {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = className;
  b.addEventListener("click", click);
  return b;
}
function render() {
  if (!demo) {
    $("mode").textContent =
      runtimeMode === "on"
        ? "Arc testnet USDC · Test tokens only · Transactions appear after confirmation"
        : "Local play coins · No real money · No public-chain transactions";
    $("coin-help").textContent =
      runtimeMode === "on"
        ? "This phone signs bounded test-USDC authorizations. Your balance and payouts come from Arc; queued requests have not settled yet. Keep this browser’s data to retain your key."
        : "Your phone holds its own identity. Keep this browser’s data to collect your coins. Local play coins are a demonstration ledger; they are not USDC and cannot be withdrawn.";
  }
  const list = $("matches");
  list.replaceChildren();
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      "No matches yet. Ask the host to open predictions in the lobby.";
    list.append(p);
  }
  for (const m of rows) {
    const b = button(
      "",
      `match-card${m.marketId === selected ? " selected" : ""}`,
      () => {
        selected = m.marketId;
        outcome = 0;
        estimate = null;
        moved = false;
        render();
        if (innerWidth < 650)
          $("detail-title").scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      },
    );
    const phase = document.createElement("span");
    phase.className = "phase";
    phase.textContent = m.phase;
    const title = document.createElement("strong");
    title.textContent = m.title;
    const summary = document.createElement("small");
    summary.textContent = `${m.humans} players · ${coins(m.pool)} in the pool`;
    b.append(phase, title, summary);
    list.append(b);
  }
  const m = current();
  $("market").hidden = !m;
  $("empty-detail").hidden = !!m;
  $("balance").textContent = token ? coins(personal.balance) : "—";
  $("connect").textContent = token ? "Connected ✓" : "Connect this phone";
  $("connect").disabled = !!token || busy;
  $("refill").hidden = !token;
  if (!m) return;
  $("game-title").textContent = m.title;
  $("market-message").textContent =
    m.reason || messages[m.phase] || "Waiting for the match";
  const position = personal.positions.find((p) => p.marketId === m.marketId),
    barred = position?.seated;
  $("position-status").hidden = !position;
  $("position-status").replaceChildren();
  if (position) {
    const p = document.createElement("p");
    p.textContent = position.pending
      ? "Your request is queued. Waiting for Arc confirmation…"
      : position.actions?.some((a) => a.status === "failed")
        ? "A request was not confirmed. Check the receipt before retrying."
        : runtimeMode === "on"
          ? `${coins(position.claimable)} test USDC available to collect.`
          : "You backed this match.";
    $("position-status").append(p);
    const confirmed = position.actions
      ?.filter((a) => a.status === "done" && a.explorer)
      .at(-1);
    if (confirmed) {
      try {
        const url = new URL(confirmed.explorer);
        if (url.protocol === "https:") {
          const a = document.createElement("a");
          a.href = url.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "View confirmed transaction";
          $("position-status").append(a);
        }
      } catch {}
    }
  }
  if (barred)
    $("market-message").textContent =
      "You’re playing this match. You can predict a different match.";
  $("outcomes").replaceChildren(
    ...m.outcomes.map((o) => {
      const b = button(
        "",
        `outcome${outcome === o.index ? " selected" : ""}`,
        () => {
          outcome = o.index;
          estimate = null;
          moved = false;
          render();
        },
      );
      const label = document.createElement("span");
      label.textContent = o.label;
      const pool = document.createElement("small");
      pool.textContent = `${coins(o.pool)} coins · ${o.mult ? `${o.mult.toFixed(1)}x` : "No opponents yet"}`;
      b.append(label, pool);
      b.disabled = m.phase !== "betting";
      b.setAttribute("aria-pressed", String(outcome === o.index));
      return b;
    }),
  );
  $("chips").replaceChildren(
    ...["50000", "100000", "250000", "500000", "1000000"].map((value) => {
      const b = button(coins(value), amount === value ? "selected" : "", () => {
        amount = value;
        estimate = null;
        moved = false;
        render();
      });
      b.setAttribute("aria-pressed", String(amount === value));
      return b;
    }),
  );
  const next = project(m);
  if (estimate === null) estimate = next;
  else if (next !== estimate) moved = true;
  $("projection").textContent = `${coins(moved ? next : estimate)} coins`;
  $("odds").hidden = !moved;
  $("confirm").disabled =
    busy ||
    demo ||
    !token ||
    moved ||
    barred ||
    m.phase !== "betting" ||
    m.stale ||
    position?.pending;
  $("confirm").textContent = !token
    ? "Connect your phone to predict"
    : "Confirm prediction";
  $("cheer").disabled =
    busy ||
    demo ||
    !token ||
    barred ||
    m.phase !== "betting" ||
    m.stale ||
    position?.pending ||
    (runtimeMode === "on" && Number(position?.cheered) > 0);
  $("claim").hidden =
    !token ||
    !position ||
    (!["final", "void"].includes(m.phase) &&
      !["paid", "refund"].includes(m.cheersPhase)) ||
    (position.claimed && position.cheersClaimed);
  $("claim").disabled =
    busy ||
    position?.pending ||
    (runtimeMode === "on" && BigInt(position?.claimable || 0) === 0n);
  countdown();
}
function countdown() {
  const m = current();
  if (!m) return;
  const seconds = Math.max(
    0,
    Math.ceil((m.closesAt - Date.now() - offset) / 1000),
  );
  $("countdown").textContent =
    m.phase === "betting" ? `${seconds}s to close` : m.phase;
  if (seconds === 0 && m.phase === "betting") {
    $("confirm").disabled = true;
    $("cheer").disabled = true;
  }
}
async function refresh() {
  if (demo) return;
  if (busy) return;
  try {
    const data = await api("matches");
    runtimeMode = data.mode;
    offset = data.serverTime - Date.now();
    rows = data.matches;
    if (!selected && rows.length) selected = rows[0].marketId;
    if (token) {
      personal = await api("market/me");
      for (const m of personal.matches || [])
        if (!rows.some((r) => r.marketId === m.marketId)) rows.push(m);
    }
    status(
      rows.length
        ? "Live updates connected"
        : "Ready when a host opens predictions",
    );
    render();
  } catch (e) {
    status(`${e.message}. Keeping the last view; retrying…`);
    $("confirm").disabled = true;
    $("cheer").disabled = true;
  }
}
async function action(fn) {
  if (busy) return;
  busy = true;
  render();
  try {
    await fn();
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
    render();
  }
}
$("connect").onclick = () =>
  action(async () => {
    signer ||= await import("/web3/phone-signer.js");
    identity = signer.loadOrCreateKey();
    const challenge = await api("market/challenge", {});
    if (
      !/^0x[\da-f]{64}$/i.test(challenge.nonce) ||
      challenge.expiresAt < Date.now() - 60_000 ||
      challenge.expiresAt > Date.now() + 120_000
    )
      throw Error("Invalid phone challenge");
    const signature = await signer.signTyped(
      identityData(challenge.nonce, challenge.expiresAt),
    );
    const connected = await api("market/session", {
      ...challenge,
      address: identity,
      signature,
    });
    token = connected.token;
    personal = connected;
    status("This phone is connected. Your coins stay with this browser.");
  });
async function submit(kind) {
  const m = current();
  if (!m || m.phase !== "betting") throw Error("Predictions closed");
  if (runtimeMode === "on") {
    const requested = {
      marketId: m.marketId,
      kind,
      outcome,
      amount: kind === "cheer" ? "50000" : amount,
      minPayout: kind === "cheer" ? "0" : estimate,
    };
    const quote = await api("market/quote", requested);
    if (
      quote.marketRef !== m.marketId ||
      quote.kind !== kind ||
      quote.bettor.toLowerCase() !== identity.toLowerCase() ||
      quote.amount !== requested.amount ||
      quote.minPayout !== requested.minPayout ||
      quote.outcome !== outcome ||
      quote.asset.toLowerCase() !== m.tokenAddress.toLowerCase() ||
      quote.contract.toLowerCase() !==
        (kind === "cheer" ? m.cheerContract : m.contract).toLowerCase() ||
      quote.chainId !== m.chainId ||
      quote.chainMarketId !== m.chainMarketId
    )
      throw Error("Arc authorization differs from the card");
    const signature = await signer.signTyped(
      fundingIntent(quote, { now: Date.now() + offset }),
    );
    await api("market/bet", { intent: { quoteId: quote.quoteId }, signature });
    personal = await api("market/me");
    status("Request queued. Your balance updates after Arc confirms it.");
    return;
  }
  const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, "0")).join("")}`;
  const intent = {
    marketId: m.marketId,
    kind,
    outcome,
    amount: kind === "cheer" ? "50000" : amount,
    minPayout: kind === "cheer" ? "0" : estimate,
    nonce,
    expiresAt: m.closesAt,
  };
  const signature = await signer.signTyped(betData(intent));
  await api("market/bet", { intent, signature });
  personal = await api("market/me");
  const refreshed = await api("matches");
  rows = refreshed.matches;
  offset = refreshed.serverTime - Date.now();
  status(
    kind === "cheer"
      ? "Cheer sent! Every human player shares it after verification."
      : "Prediction saved. Follow the match here.",
  );
  estimate = null;
}
$("confirm").onclick = () => action(() => submit("prediction"));
$("cheer").onclick = () => action(() => submit("cheer"));
$("accept-odds").onclick = () => {
  estimate = project(current());
  moved = false;
  render();
};
$("claim").onclick = () =>
  action(async () => {
    const result = await api("market/claim", { marketId: selected });
    personal = await api("market/me");
    status(
      result.queued
        ? "Payout request queued. Waiting for Arc confirmation."
        : `Collected ${coins(result.amount)} play coins.`,
    );
  });
$("refill").onclick = () =>
  action(async () => {
    const result = await api("market/refill", {});
    personal = await api("market/me");
    status(
      result.queued
        ? "Test-USDC bankroll requested. It will appear after confirmation."
        : "Play coins refilled.",
    );
  });
if (demo) {
  rows = [
    {
      marketId: `0x${"a".repeat(64)}`,
      title: "Star Catch",
      phase: "betting",
      humans: 3,
      pool: "700000",
      closesAt: Date.now() + 60_000,
      outcomes: [
        { index: 0, label: "Mochi", pool: "300000", mult: 2.3 },
        { index: 1, label: "Pixel", pool: "250000", mult: 2.8 },
        { index: 2, label: "Miso", pool: "150000", mult: 4.7 },
      ],
    },
  ];
  selected = rows[0].marketId;
  $("mode").textContent = "Preview · Sample match · No coins can be sent";
  $("connect").hidden = true;
  status("Explore a sample prediction card.");
  render();
} else refresh();
setInterval(refresh, 2500);
setInterval(countdown, 500);
