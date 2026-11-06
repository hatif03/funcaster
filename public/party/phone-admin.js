import { games, optionSchema, matchSetup, gameById } from "/core/catalog.js";
import { holdButton } from "./hold.js";
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
/** Administration lives outside the playing surface and uses only the phone grant. */
export function mountPhoneAdmin(socket, getState) {
  const dialog = node("dialog", null, "settings-dialog admin-dialog"),
    close = node("button", "×", "icon-button dialog-close");
  dialog.dataset.scroll = "";
  close.setAttribute("aria-label", "Close party controls");
  close.onclick = () => dialog.close();
  const title = node("h2", "Your party."),
    message = node("p", null, "admin-message"),
    authority = node("p", null, "admin-message"),
    pinForm = node("form"),
    pinLabel = node("label", "Staff PIN"),
    pin = node("input"),
    unlock = node("button", "Unlock staff controls", "secondary-button");
  pin.type = "password";
  pin.inputMode = "numeric";
  pin.maxLength = 6;
  pin.autocomplete = "off";
  pin.required = true;
  pin.pattern = "[0-9]{6}";
  pinLabel.append(pin);
  pinForm.append(pinLabel, unlock);
  const body = node("section"),
    start = node("button", "Start game", "primary-button"),
    pause = node("button", "Pause", "secondary-button"),
    extend = node("button", "Add a little time", "secondary-button"),
    lobby = node("button", "Hold to return to game room", "secondary-button"),
    gameGrid = node("div", null, "admin-game-grid"),
    options = node("div", null, "admin-options"),
    crew = node("div", null, "admin-crew"),
    lock = node("button", "Lock new joins", "secondary-button"),
    stats = node("button", "Event stats", "secondary-button"),
    statsText = node("p"),
    staffLock = node("button", "Lock staff controls", "text-button");
  body.append(
    start,
    pause,
    extend,
    lobby,
    node("h3", "Next game"),
    gameGrid,
    options,
    node("h3", "Your crew"),
    crew,
    lock,
    stats,
    statsText,
    staffLock,
  );
  authority.setAttribute("aria-live", "polite");
  authority.hidden = true;
  dialog.append(close, title, authority, message, pinForm, body);
  document.body.append(dialog);
  let rights = { host: false, staff: false },
    seq = Date.now(),
    signature = "";
  const open = document.getElementById("phone-admin-open");
  open.onclick = () => {
    document.getElementById("settings")?.close();
    render();
    dialog.showModal();
  };
  document.querySelectorAll("[data-staff-open]").forEach(
    (b) =>
      (b.onclick = () => {
        document.getElementById("settings")?.close();
        render();
        dialog.showModal();
      }),
  );
  function command(cmd, args = {}) {
    return new Promise((resolve) => {
      socket
        .timeout(5000)
        .emit("host.cmd", { seq: ++seq, cmd, args }, (error, result) => {
          message.textContent = error
            ? "Couldn’t reach the screen. Try again."
            : result?.error || "";
          resolve(error ? { error: true } : result);
        });
    });
  }
  pinForm.onsubmit = (e) => {
    e.preventDefault();
    socket
      .timeout(5000)
      .emit("staff.unlock", { pin: pin.value }, (error, r) => {
        pin.value = "";
        message.textContent = error
          ? "Connection lost. Try again."
          : r.error || "Staff controls unlocked.";
        if (r?.ok) {
          rights.staff = true;
          render();
        }
      });
  };
  start.onclick = () =>
    command("start").then((r) => {
      if (r?.ok) dialog.close();
    });
  pause.onclick = () => command("pause");
  extend.onclick = () => command("extend");
  holdButton(lobby, () => command("lobby", { confirmed: true }));
  lock.onclick = () => command("lock", { locked: !getState()?.locked });
  stats.onclick = () =>
    command("stats").then((r) => {
      if (r?.ok)
        statsText.textContent = `${r.metrics.joins} joins · ${r.metrics.completed} completed rounds · ${r.metrics.forfeits} forfeits${r.metrics.storageError ? " · Storage needs attention" : ""}`;
    });
  staffLock.onclick = () => {
    socket.emit("staff.lock");
    rights.staff = false;
    render();
  };
  for (const game of games) {
    const b = node("button", game.title, "secondary-button");
    b.dataset.game = game.id;
    b.onclick = () => command("select", { game: game.id });
    gameGrid.append(b);
  }
  function render() {
    const s = getState();
    const allowed = rights.host || rights.staff;
    open.hidden = !allowed;
    body.hidden = !allowed;
    pinForm.hidden = allowed;
    title.textContent = rights.staff
      ? "Staff controls."
      : rights.host
        ? "You’re the host."
        : "Staff access.";
    if (!s) return;
    authority.hidden = !s.web3?.host?.message;
    authority.textContent = s.web3?.host?.message || "";
    const waiting = ["lobby", "results"].includes(s.phase);
    start.disabled = !waiting || s.startReason !== "Ready to play";
    start.textContent = start.disabled
      ? s.startReason || "Round in progress"
      : "Start game";
    pause.hidden = waiting;
    extend.hidden = s.phase !== "classic";
    extend.disabled = s.paused || s.extensions >= 2;
    extend.textContent =
      s.game === "golf" ? "Add 30 seconds to this turn" : "Add 60 seconds";
    pause.textContent = s.paused ? "Resume game" : "Pause game";
    lobby.hidden = waiting;
    lock.textContent = s.locked ? "Unlock new joins" : "Lock new joins";
    staffLock.hidden = !rights.staff;
    stats.hidden = !rights.staff;
    for (const b of gameGrid.children) {
      b.disabled = !waiting;
      b.setAttribute("aria-pressed", String(b.dataset.game === s.game));
    }
    const key = JSON.stringify([
      s.game,
      s.setup,
      s.players.map((p) => [p.slot, p.ready, p.connected]),
      s.hostSeat,
      rights.host,
      rights.staff,
      waiting,
    ]);
    if (key === signature) return;
    signature = key;
    options.replaceChildren();
    for (const field of optionSchema(s.game)) {
      const label = node("label", field.label),
        select = node("select");
      select.disabled = !waiting;
      for (const [value, name] of field.choices) {
        const o = node("option", name);
        o.value = String(value);
        select.append(o);
      }
      const value =
        field.key === "mode" || field.key === "cpuCount"
          ? (s.setup?.[field.key] ?? "auto")
          : (matchSetup(
              gameById(s.game),
              s.setup,
              s.players.filter((p) => p.ready).length,
            )[field.key] ?? field.choices[0][0]);
      select.value =
        field.key === "wind"
          ? value === true || value === "on"
            ? "on"
            : "off"
          : String(value);
      select.onchange = () =>
        command("setup", {
          ...s.setup,
          [field.key]:
            select.value === "auto" && field.key === "cpuCount"
              ? null
              : field.choices.find(([v]) => String(v) === select.value)?.[0],
        });
      label.append(select);
      options.append(label);
    }
    if (s.game === "drawing") {
      const label = node("label", "Custom drawing words"),
        words = node("textarea"),
        apply = node("button", "Use this word deck", "secondary-button");
      words.id = "phone-custom-words";
      label.htmlFor = words.id;
      label.tabIndex = -1;
      words.rows = 3;
      words.maxLength = 2050;
      words.value = (s.setup.customWords || []).join("\n");
      words.disabled = !waiting;
      apply.disabled = !waiting;
      apply.onclick = () =>
        command("setup", {
          ...s.setup,
          customWords: words.value.split(/[,\n]/),
        });
      label.append(words);
      options.append(label, apply);
    }
    crew.replaceChildren();
    for (const p of s.players) {
      const row = node("div", null, "admin-person"),
        name = node(
          "span",
          `${p.shape || "●"} ${p.name}${p.slot === s.hostSeat ? " · host" : ""}`,
        );
      row.append(name);
      if (
        p.slot !== s.hostSeat &&
        p.ready &&
        p.connected &&
        s.operatingMode === "party"
      ) {
        const transfer = node("button", "Make host", "secondary-button");
        transfer.onclick = () => command("transfer", { slot: p.slot });
        row.append(transfer);
      }
      if (rights.staff || p.slot !== s.hostSeat) {
        const remove = node("button", "Hold to remove", "text-button");
        holdButton(remove, () =>
          command("remove", { slot: p.slot, confirmed: true }),
        );
        row.append(remove);
      }
      crew.append(row);
    }
  }
  socket.on("phone-text", (request, ack = () => {}) => {
    const state = getState();
    if (
      request?.field !== "customWords" ||
      !rights.host ||
      state?.game !== "drawing" ||
      !["lobby", "results"].includes(state?.phase)
    ) {
      ack({
        error:
          "Custom words are available on the host phone before a Drawing round.",
      });
      return;
    }
    document.getElementById("settings")?.close();
    render();
    if (!dialog.open) dialog.showModal();
    const words = document.getElementById("phone-custom-words");
    if (!words) {
      ack({ error: "The word editor is unavailable." });
      return;
    }
    message.textContent =
      "Tap the word box to edit the deck, then choose Use this word deck.";
    words.parentElement.focus({ preventScroll: true });
    words.scrollIntoView({ block: "center", behavior: "instant" });
    ack({ ok: true });
  });
  socket.on("admin.state", (next) => {
    if (rights.host && !next.host && !next.staff && dialog.open) dialog.close();
    rights = next;
    seq = Math.max(seq, next.seq || 0);
    render();
  });
  socket.on("state", render);
  socket.on("disconnect", () => {
    rights = { host: false, staff: false };
    dialog.close();
    render();
  });
  socket.on("host.offer", () => {
    message.textContent =
      "The big screen is assigning you party controls. You can decline.";
  });
  const decline = node("button", "Pass hosting to someone else", "text-button");
  decline.onclick = () => {
    socket.emit("host.decline");
    dialog.close();
  };
  body.append(decline);
  render();
}
