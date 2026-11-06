import { address, signTyped, loadOrCreateKey } from "/web3/phone-signer.js";
import { rebuildPayment, rebuildClaim } from "/commerce/signing.js";
const $ = (s) => document.querySelector(s),
  notice = $("#notice");
let catalog, me;
const activeAccess = new Map();
const context = new URLSearchParams(location.search);
if (/^[a-zA-Z0-9_-]{6,24}$/.test(context.get("commerceRoom") || ""))
  $("#room").value = context.get("commerceRoom");
const money = (value) =>
  `${(Number(value) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
const tell = (text, error = false) => {
  notice.textContent = text;
  notice.className = error ? "error" : "";
};
async function api(path, body) {
  const response = await fetch("/api/commerce" + path, {
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || "UNAVAILABLE");
  return value;
}
async function execute(action, payload) {
  const challenge = await api("/challenge", { action, payload, address: me });
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest =
    "0x" +
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  // Rebuild the allowed message locally; never sign arbitrary server typed data.
  const expires = challenge.typedData?.message?.expires;
  if (
    !/^0x[\da-f]{64}$/.test(challenge.nonce) ||
    !Number.isSafeInteger(expires) ||
    expires < Date.now() ||
    expires > Date.now() + 125000
  )
    throw Error("INVALID_CHALLENGE");
  const typedData = {
    domain: { name: "Funcaster Creator Commerce", version: "1", chainId: 5042002 },
    primaryType: "CommerceRequest",
    types: {
      CommerceRequest: [
        { name: "action", type: "string" },
        { name: "requestHash", type: "bytes32" },
        { name: "nonce", type: "bytes32" },
        { name: "expires", type: "uint256" },
      ],
    },
    message: { action, requestHash: digest, nonce: challenge.nonce, expires },
  };
  const signature = await signTyped(typedData);
  return api("/execute", { nonce: challenge.nonce, signature });
}
async function waitOperation(result) {
  if (!result.operationId) return result;
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await api(
      "/operations/" + encodeURIComponent(result.operationId),
    );
    if (status.status === "confirmed") return status;
    if (status.status === "failed") throw Error("TRANSACTION_NEEDS_REVIEW");
    tell(
      `Arc ${status.action}: ${status.status}. Keep this page open; your saved operation will resume without another payment.`,
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw Error("STILL_PENDING_REOPEN_TO_RESUME");
}
function receiptLink(parent, receipt) {
  if (!/^0x[\da-f]{64}$/i.test(receipt.tx || "")) return;
  const link = text("a", "View verified Arc receipt ↗");
  link.href = "https://explorer.testnet.arc.io/tx/" + receipt.tx;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "receipt-link";
  parent.append(link);
}
async function busy(button, work) {
  button.disabled = true;
  try {
    await work();
  } catch (error) {
    tell(error.message.replaceAll("_", " "), true);
  } finally {
    button.disabled = button.dataset.unavailable === "true";
  }
}
function text(tag, value, cls) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (cls) node.className = cls;
  return node;
}
function tab(id) {
  for (const section of document.querySelectorAll("main>section"))
    section.hidden = section.id !== id;
  for (const button of document.querySelectorAll("[data-tab]"))
    button.classList.toggle("active", button.dataset.tab === id);
  if (id === "earnings") earnings().catch((e) => tell(e.message, true));
}
for (const button of document.querySelectorAll("[data-tab]"))
  button.addEventListener("click", () => tab(button.dataset.tab));
async function refresh() {
  catalog = await api("/catalog");
  $("#mode").textContent =
    catalog.mode === "mock"
      ? "MOCK · local simulation"
      : catalog.mode === "on"
        ? catalog.available
          ? "Arc testnet · test USDC"
          : "Arc testnet · setup pending"
        : "Commerce disabled";
  $("#game-select").replaceChildren(
    ...catalog.firstPartyGames.map((g) => {
      const o = text("option", g.title);
      o.value = g.id;
      return o;
    }),
  );
  $("#games").replaceChildren();
  if (!catalog.versions.length)
    $("#games").append(
      text(
        "p",
        "The shelf is ready for your first game. Open “Publish a game” to add a built-in demo.",
      ),
    );
  const selectedVersion = context.get("commerceVersion");
  const versions = selectedVersion
    ? catalog.versions.filter((game) => game.id === selectedVersion)
    : catalog.versions;
  for (const game of versions) {
    const card = text("article", "", "card");
    card.append(
      text("span", "🐾", "icon"),
      text("h3", game.title),
      text("p", `Version ${game.version} · First-party demo`, "muted"),
      text("p", `${money(game.price)} test USDC / room`, "price"),
      text(
        "p",
        `Creator ${game.creator.slice(0, 8)}…${game.creator.slice(-4)}`,
      ),
    );
    const link = new URL(location.href);
    link.searchParams.set("ref", game.creatorCode);
    const referral = text("a", "Copy creator referral link");
    referral.href = link.href;
    referral.addEventListener("click", (e) => {
      e.preventDefault();
      navigator.clipboard
        .writeText(link.href)
        .then(() =>
          tell(
            "Creator link copied. It preserves the 5% creator-brought rate after the free band.",
          ),
        )
        .catch(() => tell(link.href));
    });
    card.append(referral);
    if (game.referral) {
      const affiliate = new URL(location.href);
      affiliate.searchParams.set("ref", game.referralCode);
      const affiliateLink = text(
        "a",
        `Copy ${game.referralBps / 100}% referral link`,
      );
      affiliateLink.href = affiliate.href;
      affiliateLink.addEventListener("click", (event) => {
        event.preventDefault();
        navigator.clipboard
          .writeText(affiliate.href)
          .then(() => tell("Referral link copied."))
          .catch(() => tell(affiliate.href));
      });
      card.append(text("br", ""), affiliateLink);
    }
    const code = new URLSearchParams(location.search).get("ref") || "";
    const acceptedCode = [game.referralCode, game.creatorCode].includes(code)
      ? code
      : "";
    const demo = text("button", "Play free demo");
    demo.addEventListener("click", () =>
      busy(demo, async () => {
        const roomCode = $("#room").value;
        await execute("demo", { versionId: game.id, roomCode });
        const access = await api("/access", {
          versionId: game.id,
          roomCode,
          buyer: me,
        });
        if (!access.allowed) throw Error("DEMO_EXPIRED");
        openGame(card, game, access);
      }),
    );
    const buy = text(
      "button",
      catalog.mode === "mock" ? "Simulate room pass" : "Get room pass",
      "primary",
    );
    buy.dataset.buyPass = "true";
    buy.addEventListener("click", () =>
      busy(buy, async () => {
        const roomCode = $("#room").value;
        const pendingKey = `chonks.commerce.payment.${game.id}.${roomCode}.${me}.${acceptedCode}`;
        let paymentId = localStorage.getItem(pendingKey);
        if (!paymentId) {
          paymentId = crypto.randomUUID();
          localStorage.setItem(pendingKey, paymentId);
        }
        let result;
        if (catalog.mode === "on") {
          const prepared = await api("/prepare", {
            action: "pay",
            address: me,
            payload: {
              operationId: paymentId,
              versionId: game.id,
              roomCode,
              code: acceptedCode,
            },
          });
          if (prepared.status) result = await waitOperation(prepared);
          else {
            const data = rebuildPayment(prepared, {
              deployment: catalog.deployment,
              game,
              buyer: me,
              roomCode,
              code: acceptedCode,
            });
            result = await waitOperation(
              await execute("pay", {
                operationId: paymentId,
                permitSignature: await signTyped(data.permit),
                authorizationSignature: await signTyped(data.authorization),
              }),
            );
          }
        } else
          result = await execute("pay", {
            versionId: game.id,
            roomCode,
            code: acceptedCode,
            atVenue: !!game.venue,
            paymentId,
          });
        localStorage.removeItem(pendingKey);
        let split = card.querySelector(".split-receipt");
        if (!split) {
          split = text("aside", "", "split-receipt");
          card.append(split);
        }
        split.textContent = `${catalog.mode === "mock" ? "MOCK pass recorded." : "Pass confirmed."} Split: ${Object.entries(
          result.credits,
        )
          .map(
            ([who, n]) =>
              `${who === me ? "you" : who.slice(0, 8) + "…"} ${money(n)}`,
          )
          .join(" · ")} test USDC. Each recipient can claim independently.`;
        receiptLink(split, result);
        openGame(
          card,
          game,
          await api("/access", { versionId: game.id, roomCode, buyer: me }),
        );
      }),
    );
    demo.disabled = buy.disabled = !(
      catalog.mode === "mock" ||
      (catalog.mode === "on" &&
        catalog.available &&
        game.status === "published")
    );
    card.append(demo, buy);
    $("#games").append(card);
  }
  $("#publish-form button[type=submit]").disabled = !(
    catalog.mode === "mock" ||
    (catalog.mode === "on" && catalog.available)
  );
}
function openGame(card, game, access) {
  if (!access.allowed) throw Error("PASS_REQUIRED");
  let link = card.querySelector(".play");
  if (!link) {
    link = text("a", "Start game →", "play");
    card.append(link);
  }
  const inRoom = context.has("commerceVersion") && context.has("commerceRoom");
  const target = new URL(inRoom ? "/controller" : "/", location.origin);
  if (inRoom) target.searchParams.set("room", $("#room").value);
  else target.searchParams.set("shell", "os");
  link.href = target.pathname + target.search;
  link.textContent = inRoom
    ? "Return to your controller →"
    : "Return to Funcaster →";
  let remaining = card.querySelector(".access-time");
  if (!remaining) {
    remaining = text("p", "", "access-time muted");
    card.append(remaining);
  }
  activeAccess.set(game.id, { card, game, access, roomCode: $("#room").value });
  updateAccess();
  tell(
    access.kind === "free-demo"
      ? "Your free demo is ready. The room gate has two minutes of access."
      : "Your room pass is ready for 24 hours.",
  );
}
function updateAccess() {
  for (const { card, access } of activeAccess.values()) {
    const seconds = Math.max(
      0,
      Math.ceil((access.expiresAt - Date.now()) / 1000),
    );
    card.querySelector(".access-time").textContent =
      access.kind === "free-demo"
        ? seconds
          ? `Demo access: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining`
          : "Free demo finished. Get a room pass to keep playing."
        : `Room pass expires ${new Date(access.expiresAt).toLocaleString()}`;
    if (!seconds) card.querySelector(".play")?.remove();
  }
}
setInterval(updateAccess, 1000);
$("#publish-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const f = new FormData(e.target),
      collaborator = f.get("collaborator").trim(),
      percent = Number(f.get("collaboratorPercent"));
    const price = f.get("price");
    if (!/^\d+(?:\.\d{1,6})?$/.test(price)) throw Error("INVALID_PRICE");
    const [whole, frac = ""] = price.split(".");
    const payload = {
      gameId: f.get("gameId"),
      version: f.get("version"),
      price: (
        BigInt(whole) * 1000000n +
        BigInt(frac.padEnd(6, "0"))
      ).toString(),
      creator: me,
    };
    if (collaborator)
      payload.collaborators = [
        { address: me, bps: 10000 - percent * 100 },
        { address: collaborator, bps: percent * 100 },
      ];
    if (f.get("referralAddress").trim()) {
      payload.referralAddress = f.get("referralAddress").trim();
      payload.referralBps = Number(f.get("referralPercent")) * 100;
    }
    const result = await execute("register", payload);
    if (catalog.mode === "on") await waitOperation(result);
    await refresh();
    tab("shelf");
    tell(
      catalog.mode === "on"
        ? "Published with its frozen split verified on Arc. Try the free demo or get a room pass."
        : "Published locally with an immutable split. Try the free demo, then simulate a pass.",
    );
  });
});
async function earnings() {
  const value = await api("/earnings/" + me);
  $("#identity").textContent = me;
  $("#balance").textContent = money(value.claimable);
  $("#claim").disabled =
    !(
      catalog.mode === "mock" ||
      (catalog.mode === "on" && catalog.available)
    ) || BigInt(value.claimable) === 0n;
  $("#claim").dataset.unavailable = String($("#claim").disabled);
  $("#activity").replaceChildren(
    ...[...value.payments, ...value.claims]
      .sort((a, b) => b.at - a.at)
      .map((row) => {
        const entry = text(
          "div",
          `${row.mock ? "MOCK · " : ""}${row.action === "claim" ? "Claimed" : "Pass credited"} ${money(row.action === "claim" ? row.amount : row.credits[me.toLowerCase()] || "0")} test USDC · ${new Date(row.at).toLocaleString()}`,
          "activity",
        );
        receiptLink(entry, row);
        return entry;
      }),
  );
  if (!value.payments.length)
    $("#activity").append(text("p", "Your first pass sale will appear here."));
}
$("#claim").addEventListener("click", (e) =>
  busy(e.currentTarget, async () => {
    let receipt;
    if (catalog.mode === "on") {
      const key = `chonks.commerce.claim.${catalog.deployment.address}.${me}`;
      let operationId = localStorage.getItem(key);
      if (!operationId) {
        operationId = crypto.randomUUID();
        localStorage.setItem(key, operationId);
      }
      const prepared = await api("/prepare", {
        action: "claim",
        address: me,
        payload: { operationId },
      });
      receipt = prepared.status
        ? await waitOperation(prepared)
        : await waitOperation(
            await execute("claim", {
              operationId,
              signature: await signTyped(
                rebuildClaim(prepared, {
                  deployment: catalog.deployment,
                  recipient: me,
                }),
              ),
            }),
          );
      localStorage.removeItem(key);
    } else receipt = await execute("claim", { claimId: crypto.randomUUID() });
    tell(
      catalog.mode === "on"
        ? `Verified Arc claim: ${money(receipt.amount)} test USDC sent to your controller identity.`
        : `MOCK claim complete: ${money(receipt.amount)} test USDC. No public tokens moved.`,
    );
    await earnings();
  }),
);
try {
  await loadOrCreateKey();
  me = (await address()).toLowerCase();
  await refresh();
  tell(
    catalog.mode === "mock"
      ? "Local simulation: publishing, passes and claims are labelled MOCK. No public tokens move."
      : catalog.mode === "on"
        ? catalog.available
          ? "Arc testnet: one pass unlocks the room. Payments and claims show verified transaction receipts; test USDC has no cash value."
          : "Public commerce needs its verified RevenueRouter deployment. Payments remain unavailable until then."
        : "Commerce is disabled. Enable COMMERCE=mock for the local first-party demo.",
  );
} catch (error) {
  tell(
    "Creator Studio could not start: " + error.message.replaceAll("_", " "),
    true,
  );
}
