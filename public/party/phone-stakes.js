import { PHONE_STAKES_STRINGS as S } from "./phone-stakes-copy.js";
import { h } from "../os/util/h.js";

export function mountPhoneStakes(socket, getState, getSeat) {
  const title = h("h2"),
    copy = h("p"),
    detail = h("p"),
    status = h("p", { role: "status", "aria-live": "polite" });
  const accept = h("button", {
    type: "button",
    id: "terms-accept",
    text: S.accept,
  });
  const decline = h("button", {
    type: "button",
    id: "terms-decline",
    text: S.decline,
  });
  const dispute = h("button", {
    type: "button",
    id: "settle-dispute",
    text: S.dispute,
  });
  const close = h("button", { type: "button", text: S.close });
  const dialog = h(
    "dialog",
    { id: "terms", class: "phone-stakes", "aria-labelledby": "stake-title" },
    h("strong", { class: "stake-ribbon", text: S.playMoney }),
    title,
    copy,
    detail,
    status,
    h("div", { class: "stake-actions" }, accept, decline, dispute, close),
  );
  title.id = "stake-title";
  const banner = h("button", {
    type: "button",
    class: "phone-stakes-status",
    hidden: true,
    onclick: () => {
      if (!dialog.open) {
        visibleAgreeAt = Date.now() + 5000;
        dialog.showModal();
      }
    },
  });
  document.body.append(dialog, banner);
  const liveLink = h("a", {
    href: "/live/",
    target: "_blank",
    rel: "noopener",
    text: "Funcaster Live · challenges, records & creators",
  });
  document.getElementById("settings")?.append(liveLink);
  const passBanner = h("a", {
    class: "phone-stakes-status",
    target: "_blank",
    rel: "noopener",
    hidden: true,
    text: "Creator pass · open free demo or pass",
  });
  document.body.append(passBanner);
  let request = null,
    busy = false,
    finished = false,
    serverOffset = 0,
    visibleAgreeAt = 0,
    consents = new Map(),
    disputes = new Set();
  try {
    consents = new Map(
      JSON.parse(sessionStorage.getItem("chonks.stakes.consent") || "[]"),
    );
    disputes = new Set(
      JSON.parse(sessionStorage.getItem("chonks.stakes.disputes") || "[]"),
    );
  } catch {}
  function remember() {
    try {
      sessionStorage.setItem(
        "chonks.stakes.consent",
        JSON.stringify([...consents].slice(-20)),
      );
      sessionStorage.setItem(
        "chonks.stakes.disputes",
        JSON.stringify([...disputes].slice(-20)),
      );
    } catch {}
  }
  const send = (data) =>
    new Promise((resolve) =>
      socket
        .timeout(10000)
        .emit("web3.sign", data, (error, answer) =>
          resolve(error ? { error: S.waiting } : answer),
        ),
    );
  async function respond(kind) {
    if (!request || busy || finished) return;
    const r = request;
    busy = true;
    accept.disabled = decline.disabled = dispute.disabled = true;
    try {
      const signer = await import("../web3/phone-signer.js");
      let payload = { id: r.id };
      if (kind === "decline") payload.declined = true;
      else if (kind === "accept") {
        payload.signature = await signer.signStakeTerms(
          r,
          Date.now() + serverOffset,
        );
        consents.set(r.potId, {
          potId: r.potId,
          contract: r.contract,
          slots: r.slots,
          address: signer.address(),
        });
        remember();
      } else {
        payload.signature = await signer.signStakeResult(
          r,
          getState()?.result,
          consents.get(r.potId),
          kind === "dispute",
          Date.now() + serverOffset,
        );
        if (kind === "dispute") {
          payload.disputed = true;
          disputes.add(r.potId);
          remember();
        }
      }
      if (request !== r || !socket.connected) throw Error(S.waiting);
      const answer = await send(payload);
      if (answer?.error) throw Error(answer.error);
      finished = true;
      status.textContent =
        kind === "dispute"
          ? S.disputed
          : kind === "decline"
            ? S.declined
            : kind === "accept"
              ? S.funding
              : S.agreed;
      accept.hidden = decline.hidden = dispute.hidden = true;
      if (kind === "accept" || kind === "decline") dialog.close();
    } catch (error) {
      status.textContent = error.message || S.waiting;
      finished = kind === "agree";
    } finally {
      busy = false;
      accept.disabled = decline.disabled = dispute.disabled = false;
    }
  }
  accept.onclick = () => void respond("accept");
  decline.onclick = () => void respond("decline");
  dispute.onclick = () => void respond("dispute");
  close.onclick = () => dialog.close();
  function receive(value) {
    if (
      !["terms", "settle"].includes(value?.kind) ||
      !getSeat() ||
      value.expiresAt <= (value.serverTime || Date.now())
    )
      return;
    if (request?.id === value.id) return;
    request = value;
    serverOffset = (value.serverTime || Date.now()) - Date.now();
    visibleAgreeAt = Math.max(
      value.agreeAt - serverOffset || 0,
      Date.now() + 5000,
    );
    busy = false;
    finished = false;
    title.textContent = value.kind === "terms" ? S.putIn : S.result;
    copy.textContent =
      value.kind === "terms"
        ? S.terms(value.game, value.amount, value.asset, value.slots.length)
        : S.placing(
            (value.result?.scores || []).map((s) => ({
              ...s,
              name: getState()?.players?.find((p) => p.slot === s.slot)?.name,
            })),
          );
    detail.textContent =
      value.kind === "terms"
        ? `${S.rules[value.rule]} ${S.trust}`
        : S.settleHelp;
    status.textContent = value.mode === "mock" ? S.mock : "";
    accept.hidden = decline.hidden = value.kind !== "terms";
    dispute.hidden = value.kind !== "settle";
    close.hidden = value.kind === "terms";
    if (!dialog.open) dialog.showModal();
  }
  function update() {
    const state = getState(),
      v = state?.web3?.stakes;
    passBanner.hidden =
      !state?.web3?.commerce?.selected ||
      !["lobby", "results"].includes(state?.phase);
    if (!passBanner.hidden) passBanner.href = state.web3.commerce.link;
    banner.hidden =
      !passBanner.hidden ||
      !v ||
      v.status === "off" ||
      ["practice", "countdown", "playing", "classic"].includes(state?.phase);
    if (v && v.status !== "off")
      banner.textContent = `${v.mock ? "MOCK · " : ""}${S.playMoney} · ${S.states[v.status] || v.status}`;
    if (!request) return;
    if (["settled", "refunded"].includes(v?.status)) {
      finished = true;
      close.hidden = false;
      accept.hidden = decline.hidden = dispute.hidden = true;
      const at = v.slots?.indexOf(getSeat()?.slot);
      status.textContent =
        v.status === "refunded"
          ? S.refunded
          : v.claimsComplete
            ? S.paid(v.payouts?.[at] || "0", v.asset)
            : S.claiming;
      copy.textContent = status.textContent;
      title.textContent = S.finished;
      detail.textContent = S.finishedHelp;
      status.textContent = v.mock ? S.mock : "";
      return;
    }
    if (request.expiresAt <= Date.now() + serverOffset) {
      finished = true;
      close.hidden = false;
      status.textContent = S.expired;
      accept.hidden = decline.hidden = dispute.hidden = true;
      return;
    }
    if (request.kind === "settle" && !finished && !busy) {
      if (disputes.has(request.potId)) {
        status.textContent = S.disputed;
        return;
      }
      const seconds = Math.max(
        0,
        Math.ceil((visibleAgreeAt - Date.now()) / 1000),
      );
      status.textContent = seconds ? S.agreeing(seconds) : S.checking;
      if (
        !seconds &&
        dialog.open &&
        document.visibilityState === "visible" &&
        socket.connected
      )
        void respond("agree");
    }
  }
  socket.on("disconnect", () => {
    request = null;
    dialog.close();
  });
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      request?.kind === "settle" &&
      !finished
    )
      visibleAgreeAt = Math.max(visibleAgreeAt, Date.now() + 5000);
  });
  const timer = setInterval(update, 250);
  return {
    receive,
    update,
    destroy() {
      clearInterval(timer);
      dialog.remove();
      banner.remove();
      passBanner.remove();
      liveLink.remove();
    },
  };
}
