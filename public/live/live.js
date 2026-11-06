import { loadOrCreateKey, signTyped } from "/web3/phone-signer.js";
const $ = (id) => document.getElementById(id);
let backedUp = false,
  address;
const say = (text) => {
  $("status").textContent = text;
};
async function json(url, body) {
  const res = await fetch(url, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(12000),
  });
  const value = await res.json();
  if (!res.ok || value.error)
    throw Error(value.error || "This service is unavailable.");
  return value;
}
async function act(action, body = {}) {
  address = loadOrCreateKey();
  const c = await json("/api/web3/community/challenge", { action, body });
  if (
    c.domain?.name !== "Funcaster Live" ||
    c.domain.version !== "1" ||
    c.domain.chainId !== 5042002 ||
    c.primaryType !== "Action" ||
    c.message.action !== action ||
    c.message.body !== JSON.stringify(body) ||
    c.message.expiresAt <= Date.now() ||
    c.message.expiresAt > Date.now() + 65000
  )
    throw Error("Unexpected community request.");
  // Sign the local, fixed action type. Never accept server-provided type layouts.
  const types = {
    Action: [
      { name: "action", type: "string" },
      { name: "body", type: "string" },
      { name: "nonce", type: "bytes32" },
      { name: "expiresAt", type: "uint64" },
    ],
  };
  return json("/api/web3/community/action", {
    nonce: c.message.nonce,
    address,
    signature: await signTyped({
      domain: c.domain,
      types,
      primaryType: "Action",
      message: c.message,
    }),
  });
}
function button(text, fn) {
  const el = document.createElement("button");
  el.textContent = text;
  el.onclick = () => run(el, fn);
  return el;
}
async function run(control, fn) {
  if (control.disabled) return;
  control.disabled = true;
  try {
    say("");
    await fn();
  } catch (e) {
    say(e.message || "Please try again.");
  } finally {
    control.disabled = false;
  }
}
async function refresh() {
  const data = await json("/api/web3/community");
  $("offers").replaceChildren();
  if (!data.offers.length)
    $("offers").textContent =
      "No open challenges yet. Start one at your table.";
  for (const o of data.offers) {
    const row = document.createElement("article"),
      copy = document.createElement("div"),
      title = document.createElement("strong"),
      info = document.createElement("small");
    row.className = "row";
    title.textContent = `${o.challenger} · ${o.title}`;
    info.textContent = `${o.status === "open" ? "Open" : "Taken"} · expires in ${Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 60000))} min`;
    copy.append(title, info);
    row.append(copy);
    row.append(
      button(o.status === "open" ? "Take challenge" : "My invite", async () => {
        const answer = await act(o.status === "open" ? "take" : "invite", {
          id: o.id,
        });
        const link = document.createElement("a");
        link.textContent = "Join this table →";
        link.href = answer.join;
        row.replaceChildren(copy, link);
        say("Challenge accepted. Join the table; the host starts the game.");
      }),
    );
    $("offers").append(row);
  }
  $("names").replaceChildren();
  for (const name of data.names) {
    const li = document.createElement("li");
    li.textContent = name;
    $("names").append(li);
  }
  if (!data.names.length)
    $("names").textContent = "Names appear when a table connects.";
}
$("offer").onclick = () =>
  run($("offer"), async () => {
    await act("offer");
    await refresh();
    say("Challenge posted for ten minutes. Keep your table open.");
  });
$("refresh").onclick = () => run($("refresh"), refresh);
$("connect").onclick = () =>
  run($("connect"), async () => {
    const profile = await act("profile");
    const handle = profile.handle;
    $("profile").textContent = handle
      ? handle.status === "issued" && handle.name
        ? `${handle.name} · issued to this phone on Sepolia`
        : handle.status === "pending"
          ? `@${handle.handle} · ENS issuance pending. Refresh to check.`
          : handle.status === "failed"
            ? `@${handle.handle} · saved locally. ENS issuance stopped; contact the host.`
            : `@${handle.handle} · saved on this console`
      : profile.eligible
        ? profile.championAvailable
          ? "Your verified match unlocked a persistent ENS handle. Save your recovery key first."
          : "Your verified match unlocked a local handle."
        : "Connected. Play a verified match on this phone to unlock a handle.";
    $("backup").hidden = !profile.eligible;
    $("handle-form").hidden = !profile.eligible || !!handle?.claimId;
    $("connect").textContent = "Refresh my profile";
    for (const offer of profile.offers.filter((o) => o.status === "open")) {
      $("profile").append(
        button("Cancel my challenge", async () => {
          await act("cancel", { id: offer.id });
          await refresh();
        }),
      );
    }
  });
$("backup").onclick = () => {
  try {
    loadOrCreateKey();
    const key = localStorage.getItem("chonks.web3.key");
    if (!/^0x[\da-f]{64}$/i.test(key || ""))
      throw Error("Recovery key is unavailable.");
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            application: "Funcaster",
            version: 1,
            privateKey: key,
          }),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "chonks-private-recovery-key.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backedUp = true;
    say(
      "Recovery file downloaded. Store it privately; never upload it to chat or a public repository.",
    );
  } catch (e) {
    say(e.message);
  }
};
$("handle-form").onsubmit = (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button");
  run(submit, async () => {
    const answer = await act("handle", {
      handle: $("handle").value,
      backupConfirmed: backedUp,
    });
    say(answer.message);
  });
};
json("/api/web3/live-config")
  .then((c) => {
    $("mode").textContent =
      c.mode === "mock" ? "MOCK · no real payments" : "Arc + ENS · testnet";
  })
  .catch(() => {
    $("mode").textContent = "Offline / integrations disabled";
  });
refresh().catch((e) => say(e.message));
