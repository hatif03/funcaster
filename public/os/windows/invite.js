import { h } from "../util/h.js";
import { safeWebUrl, screenUrl, canEdit, playerRows } from "../window-data.js";
import { WINDOW_CONTENT_STRINGS as S } from "../strings.js";
import { utility, button, checkbox, note, section } from "./utility.js";
import { choiceList } from "./game-properties.js";
import { ENS_STRINGS as ES } from "../strings.js";
export function open(ctx) {
  const page = utility(ctx, S.inviteIntro),
    qr = h("img", { class: "os-invite-qr", alt: S.qrAlt, hidden: true }),
    qrNote = note(S.qrLoading),
    code = h("strong", { class: "os-invite-code" });
  qr.addEventListener("error", () => {
    qr.hidden = true;
    qrNote.hidden = false;
    qrNote.textContent = S.qrUnavailable;
  });
  const join = h("input", {
    type: "text",
    readOnly: true,
    "aria-label": S.link,
    dataset: { nav: "", id: "invite-link" },
  });
  const tableName = h("input", {
    type: "text",
    readOnly: true,
    "aria-label": ES.tableName,
    dataset: { nav: "", id: "table-name" },
  });
  const named = h(
    "label",
    { hidden: true, style: "display:block;min-width:0" },
    ES.tableName,
    tableName,
  );
  tableName.style.width = "100%";
  const copy = button("copy-invite", S.copy, async () => {
    try {
      await navigator.clipboard.writeText(join.value);
      page.report(S.copied);
    } catch {
      join.select();
      page.report(S.copyFail);
    }
  });
  const retry = button("retry-qr", S.qrRetry, () =>
    page.run(retry, () => {
      currentQR = "";
      return ctx.getSession().retryPairing();
    }),
  );
  const typed = h("input", {
    type: "text",
    maxLength: 6,
    autoComplete: "off",
    spellcheck: false,
    "aria-label": S.retryCode,
    dataset: { nav: "", id: "pairing-code" },
  });
  const reload = button("confirm-qr", S.confirm, () => {
    if (typed.value.trim().toUpperCase() !== ctx.store.get().room?.code)
      return page.report(S.wrongCode);
    return page.run(reload, () => {
      currentQR = "";
      return ctx.getSession().retryPairing();
    });
  });
  const second = h("a", {
    class: "xp-button",
    text: S.secondScreen,
    target: "_blank",
    rel: "noopener noreferrer",
    dataset: { nav: "", id: "second-screen" },
    hidden: true,
  });
  const remoteToggle = checkbox("remote-views", S.remoteEnable, (enabled) =>
    page.run(remoteToggle.input, () =>
      ctx.getSession().remoteConfigure(enabled),
    ),
  );
  const remoteNote = note(""),
    list = h("div", { class: "os-screen-list" }),
    remote = section(S.remote, remoteToggle.el, remoteNote, list);
  const assignments = playerRows(null).map((seat) => {
    const name = h("strong"),
      select = choiceList({
        id: `screen-seat-${seat.slot}`,
        label: `${seat.name} · ${S.remote}`,
        change: (ref) =>
          page.run(select.button, () =>
            ctx.getSession().assignSeat(seat.slot, ref || null),
          ),
      });
    const disconnect = button(`unpair-${seat.slot}`, S.unpair, () =>
      page.run(disconnect, () => ctx.getSession().revokeView(seat.slot)),
    );
    const el = h(
      "div",
      { class: "os-screen-row" },
      name,
      select.el,
      disconnect,
    );
    list.append(el);
    return { ...seat, el, name, select, disconnect };
  });
  page.content.append(
    h(
      "div",
      { class: "os-invite-hero" },
      qr,
      qrNote,
      h("span", { text: S.roomCode }),
      code,
    ),
    h("div", { class: "os-invite-link" }, join, copy),
    named,
    second,
    note(S.screenIntro),
    remote,
    h(
      "div",
      { class: "os-pairing-retry" },
      h("label", { text: S.retryCode, htmlFor: "os-pairing-code" }),
      typed,
      reload,
    ),
  );
  typed.id = "os-pairing-code";
  page.footer.append(retry);
  let currentCode = "",
    currentQR = "";
  function update(state) {
    const room = state.room,
      live = state.connection === "connected" && !ctx.demo;
    code.textContent = room?.code || "—";
    const party = room?.web3?.party;
    named.hidden = !party?.name;
    tableName.value = party?.name || "";
    if (currentCode !== room?.code) {
      currentCode = room?.code;
      typed.value = room?.code || "";
    }
    const image = state.pairing?.qr;
    if (image !== currentQR) {
      currentQR = image;
      qr.hidden = !(
        typeof image === "string" && /^data:image\/png;base64,/.test(image)
      );
      if (!qr.hidden) qr.src = image;
      else qr.removeAttribute("src");
    }
    qrNote.hidden = !qr.hidden;
    qrNote.textContent = ctx.demo
      ? S.demoInvite
      : state.pairingError ||
        (!live || state.pairingLoading ? S.qrLoading : S.qrUnavailable);
    join.value = safeWebUrl(state.pairing?.url) || "";
    page.enabled(copy, !!join.value);
    page.enabled(retry, live && !state.pairingLoading);
    page.enabled(reload, live && !state.pairingLoading);
    page.enabled(typed, live);
    const link = screenUrl(state.identity, join.value || location.origin);
    second.hidden = !link;
    if (link) second.href = link;
    else second.removeAttribute("href");
    remote.hidden = room?.remoteViews === undefined;
    remoteToggle.input.checked = !!room?.remoteViews;
    page.enabled(
      remoteToggle.input,
      live && canEdit(state) && room?.operatingMode !== "kiosk",
    );
    const screens = (state.displays || []).filter((d) => d.connected);
    remoteNote.textContent =
      room?.operatingMode === "kiosk"
        ? S.remoteKiosk
        : !screens.length
          ? S.noScreens
          : "";
    remoteNote.hidden = !remoteNote.textContent;
    for (const row of assignments) {
      const player = room?.players?.find((p) => p.slot === row.slot),
        pair = room?.screenPairings?.find((p) => p.slot === row.slot);
      row.el.hidden = !player || !room?.remoteViews;
      row.name.textContent = player?.name || S.empty;
      row.select.update(pair?.ref || "", live && canEdit(state) && !!player, [
        ["", S.mainScreen],
        ...screens
          .filter((d) => d.slot === null || d.slot === row.slot)
          .map((d) => [
            d.ref,
            `${d.label} · ${d.ready ? S.screenReady : S.screenWaiting}`,
          ]),
      ]);
      page.enabled(row.disconnect, live && !!pair);
      row.disconnect.hidden = !pair;
    }
  }
  page.refresh = () => update(ctx.store.get());
  page.refresh();
  return {
    el: page.el,
    update,
    destroy() {
      assignments.forEach((row) => row.select.destroy());
      page.destroy();
    },
  };
}
