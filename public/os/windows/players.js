import { h } from "../util/h.js";
import { playerRows, canNextPlayer } from "../window-data.js";
import { WINDOW_CONTENT_STRINGS as S } from "../strings.js";
import { utility, button, checkbox, note } from "./utility.js";
export function open(ctx) {
  const page = utility(ctx, S.playersIntro),
    list = h("ul", { class: "os-player-list" }),
    queue = note(""),
    authority = note("");
  authority.hidden = true;
  authority.setAttribute("aria-live", "polite");
  const rows = playerRows(null).map((seat) => {
    const shape = h("span", {
      class: "os-seat-shape",
      text: seat.shape,
      "aria-hidden": "true",
    });
    shape.style.setProperty("--seat", seat.color);
    const avatar = h("span", {
      class: "os-player-avatar",
      dataset: { avatarSlot: seat.slot, avatarEmpty: "true" },
      "aria-hidden": "true",
    });
    const name = h("strong"),
      status = h("span", { class: "os-status-chip" }),
      device = h("span", { class: "os-utility-note" }),
      savedName = h("span", { class: "os-utility-note", hidden: true });
    savedName.style.overflowWrap = "anywhere";
    const host = button(`host-${seat.slot}`, S.makeHost, () =>
      page.run(host, () =>
        ctx
          .getSession()
          .hostAssign(
            ctx.store.get().room?.hostSeat === seat.slot ? null : seat.slot,
          ),
      ),
    );
    const remove = button(`remove-${seat.slot}`, S.remove, () =>
      page.run(remove, () => ctx.getSession().remove(seat.slot)),
    );
    const el = h(
      "li",
      { class: "os-player-row" },
      avatar,
      h(
        "div",
        { class: "os-player-copy" },
        h("div", { class: "os-player-name" }, shape, name),
        status,
        device,
        savedName,
      ),
      h("div", { class: "os-row-actions" }, host, remove),
    );
    list.append(el);
    return {
      ...seat,
      el,
      avatar,
      name,
      status,
      device,
      savedName,
      host,
      remove,
    };
  });
  const lock = checkbox("lock-joins", S.lock, (locked) =>
    page.run(lock.input, () => ctx.getSession().cmd("lock", { locked })),
  );
  const next = button("next-player", S.next, () =>
    page.run(next, () => ctx.getSession().nextPlayer()),
  );
  page.content.append(authority, list, queue, lock.el, note(S.hostExplain));
  page.footer.append(
    button("players-recycle", S.recycle, () => ctx.openWindow("recycle-bin")),
    next,
  );
  function update(state) {
    const room = state.room,
      live = state.connection === "connected" && !ctx.demo;
    for (const data of playerRows(room)) {
      const row = rows[data.slot];
      row.avatar.dataset.avatarEmpty = String(!data.player);
      row.name.textContent = data.player ? data.name : S.empty;
      row.status.textContent = [
        S[data.status],
        data.host ? S.host : data.pending ? S.pending : null,
      ]
        .filter(Boolean)
        .join(" · ");
      row.device.textContent = data.player
        ? data.player.device
          ? `${S.tier(data.player.device.tier)} · ${data.player.device.platform} · ${data.player.connected ? S.connected : S.offline}`
          : `${data.player.mode === "motion" ? S.motion : S.touch} · ${S.noDevice}`
        : data.name;
      row.el.dataset.status = data.status;
      const saved = room?.web3?.seats?.find((p) => p.slot === data.slot);
      row.savedName.hidden = !room?.web3 || !data.player;
      row.savedName.textContent = saved?.named
        ? `${S.nameReady} · ${saved.name}`
        : saved?.status === "pending"
          ? S.nameSaving
          : S.nameLocal;
      row.host.textContent = data.host
        ? S.revokeHost
        : data.pending
          ? S.pending
          : S.makeHost;
      page.enabled(
        row.host,
        live &&
          room?.operatingMode === "party" &&
          !!data.player?.connected &&
          !!data.player?.ready &&
          !data.pending,
      );
      page.enabled(row.remove, live && !!data.player);
    }
    queue.textContent = S.queue(room?.queueCount || 0);
    authority.hidden = !room?.web3?.host?.message;
    authority.textContent = room?.web3?.host?.message || "";
    lock.input.checked = !!room?.locked;
    page.enabled(lock.input, live && !!room?.arcade);
    page.enabled(next, live && canNextPlayer(state));
  }
  page.refresh = () => update(ctx.store.get());
  page.refresh();
  return { el: page.el, update, destroy: page.destroy };
}
