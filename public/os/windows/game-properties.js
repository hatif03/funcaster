import { gameById } from "../../../core/catalog.js";
import { SEATS } from "../../../core/seats.js";
import { artwork } from "../../party/art.js";
import { PROPERTIES_STRINGS as S, WEB3_STRINGS as W } from "../strings.js";
import { h } from "../util/h.js";
import { visibleFocusable } from "../wm.js";
import {
  PRESETS,
  optionFields,
  optionGroups,
  coerceChoice,
  createPropertiesModel,
  pairFor,
  setupSummary,
} from "../option-ui.js";

/** A button-operated listbox works with mouse, keyboard and the phone cursor. */
export function choiceList({ id, label, choices = [], change }) {
  const list = h("div", {
    id: `${id}-list`,
    class: "gp-choice-list",
    role: "listbox",
    "aria-label": label,
    hidden: true,
  });
  const button = h("button", {
    type: "button",
    class: "xp-button gp-select",
    "aria-label": label,
    "aria-haspopup": "listbox",
    "aria-expanded": "false",
    "aria-controls": list.id,
    dataset: { nav: "", id },
    onclick: () => (list.hidden ? show() : hide()),
  });
  const el = h("div", { class: "gp-select-wrap" }, button, list);
  let current,
    items = [],
    signature = "";
  function hide(focus = true) {
    list.hidden = true;
    delete list.dataset.navScope;
    button.setAttribute("aria-expanded", "false");
    if (focus) button.focus();
  }
  function show() {
    if (button.disabled || !items.length) return;
    list.hidden = false;
    list.dataset.navScope = "active";
    button.setAttribute("aria-expanded", "true");
    (
      items.find((item) => String(item.value) === String(current)) || items[0]
    ).el.focus();
  }
  function update(value, enabled = true, options = choices) {
    current = value;
    const key = JSON.stringify(options);
    if (key !== signature) {
      signature = key;
      items = options.map(([value, text]) => ({
        value,
        el: h("button", {
          type: "button",
          role: "option",
          tabIndex: -1,
          text,
          dataset: { nav: "", id: `${id}-${value}` },
          onclick() {
            change(value);
            hide();
          },
        }),
      }));
      list.replaceChildren(...items.map((item) => item.el));
    }
    const selected = options.find(([v]) => String(v) === String(value));
    button.textContent = `${selected?.[1] || S.choosePlayer} ▾`;
    button.disabled = !enabled || !options.length;
    for (const item of items)
      item.el.setAttribute(
        "aria-selected",
        String(String(item.value) === String(value)),
      );
    if (button.disabled) hide(false);
  }
  list.addEventListener("os:back", (event) => {
    event.preventDefault();
    hide();
  });
  el.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (list.hidden) return show();
      const at = items.findIndex((item) => item.el === document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.el.focus();
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      hide();
    } else if (event.key === "Tab") hide(false);
  });
  const outside = (event) => {
    if (!el.contains(event.target)) hide(false);
  };
  document.addEventListener("pointerdown", outside, true);
  update(undefined);
  return {
    el,
    button,
    update,
    close: hide,
    destroy() {
      document.removeEventListener("pointerdown", outside, true);
    },
  };
}

function seatsView() {
  const seats = SEATS.map((seat, slot) => {
    const shape = h("span", {
      class: "gp-seat-shape",
      text: seat.shape,
      "aria-hidden": "true",
    });
    shape.style.setProperty("--seat", seat.color);
    const name = h("strong"),
      status = h("span", { class: "gp-seat-status" });
    return {
      slot,
      name,
      status,
      el: h("li", { class: "gp-seat" }, shape, h("div", {}, name, status)),
    };
  });
  const el = h(
    "ul",
    { class: "gp-seats", "aria-label": S.tabs.players },
    seats.map((seat) => seat.el),
  );
  return {
    el,
    update(room) {
      for (const seat of seats) {
        const player = room?.players?.find(
          (player) => player.slot === seat.slot,
        );
        seat.name.textContent = player?.name || S.empty;
        seat.status.textContent = !player
          ? SEATS[seat.slot].name
          : !player.connected
            ? S.away
            : player.ready
              ? S.ready
              : S.joined;
        seat.el.dataset.status = !player
          ? "empty"
          : !player.connected
            ? "away"
            : player.ready
              ? "ready"
              : "joined";
      }
    },
  };
}

function fieldControl(field, game, model, ctx, reportError) {
  const id = `gp-${game.id}-${field.key}`,
    label = h("h3", { id: `${id}-label`, text: field.label });
  const help = h("p", { class: "gp-field-help", id: `${id}-help` });
  const el = h(
    "div",
    { class: "gp-field", dataset: { option: field.key } },
    label,
  );
  let updater = () => {},
    destroy = () => {};
  const send = (value) =>
    model.change({ [field.key]: coerceChoice(game.id, field.key, value) });
  if (field.kind === "segments") {
    const buttons = field.choices.map(([value, text]) =>
      h("button", {
        type: "button",
        text,
        class: "xp-button gp-segment",
        role: "radio",
        dataset: { nav: "", id: `${id}-${value}` },
        onclick: () => send(value),
      }),
    );
    const group = h(
      "div",
      {
        class: "gp-segments",
        role: "radiogroup",
        dataset: { navGroup: id },
        "aria-labelledby": label.id,
        "aria-describedby": help.id,
      },
      buttons,
    );
    group.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      const at = buttons.indexOf(document.activeElement);
      if (at < 0) return;
      event.preventDefault();
      event.stopPropagation();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (at + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[next].focus();
      buttons[next].click();
    });
    updater = (next) =>
      buttons.forEach((button, i) => {
        const selected = String(next.choices[i][0]) === String(next.value);
        button.disabled = !next.enabled;
        button.tabIndex = selected ? 0 : -1;
        button.setAttribute("aria-checked", String(selected));
      });
    el.append(group);
  } else if (field.kind === "toggle") {
    const box = h("span", { class: "gp-checkbox-mark", "aria-hidden": "true" });
    const text = h("span");
    const button = h(
      "button",
      {
        type: "button",
        role: "checkbox",
        class: "gp-checkbox",
        "aria-describedby": help.id,
        dataset: { nav: "", id },
        onclick: () => send(!model.snapshot().setup[field.key]),
      },
      box,
      text,
    );
    updater = (next) => {
      button.disabled = !next.enabled;
      button.setAttribute("aria-checked", String(!!next.value));
      box.textContent = next.value ? "✓" : "";
      text.textContent =
        next.choices.find(([value]) => value === !!next.value)?.[1] ||
        next.label;
    };
    el.append(button);
  } else if (field.kind === "stakes") {
    el.style.display = "grid";
    el.style.gap = "6px";
    let amount = "0.50",
      rule = "winner",
      busy = false;
    const amounts = choiceList({
      id: "gp-stakes-amount",
      label: W.amount,
      choices: [
        ["0.50", "0.50 play-USDC"],
        ["1.00", "1.00 play-USDC"],
        ["2.00", "2.00 play-USDC"],
      ],
      change: (value) => {
        amount = value;
        amounts.update(amount);
      },
    });
    const rules = choiceList({
      id: "gp-stakes-rule",
      label: W.payout,
      choices: Object.entries(W.rules),
      change: (value) => {
        rule = value;
        rules.update(rule);
      },
    });
    const note = h("p", { class: "gp-field-help", role: "status" });
    const apply = h("button", {
      type: "button",
      class: "xp-button",
      text: W.apply,
      dataset: { nav: "", id: "gp-stakes" },
      async onclick() {
        if (busy) return;
        busy = true;
        apply.disabled = true;
        try {
          await model.flush();
          const answer = await ctx
            .getSession()
            .stakes({ rung: 1, amount, rule });
          if (answer?.error) reportError(answer.error);
        } finally {
          busy = false;
          updater(null, model.snapshot().room);
        }
      },
    });
    const cancel = h("button", {
      type: "button",
      class: "xp-button",
      text: W.cancel,
      dataset: { nav: "", id: "gp-stakes-cancel" },
      async onclick() {
        const action = await ctx.wm.modal({
          title: W.cancelTitle,
          text: W.cancelHelp,
          buttons: [
            { id: "cancel-stakes", label: W.cancel },
            { id: "keep", label: W.keep },
          ],
          cancelButton: "keep",
        });
        if (action !== "cancel-stakes") return;
        const answer = await ctx.getSession().stakes({ cancel: true });
        if (answer?.error) reportError(answer.error);
      },
    });
    const pot = h("a", {
      class: "xp-button",
      text: W.pot,
      target: "_blank",
      rel: "noopener",
      dataset: { nav: "", id: "gp-stakes-pot" },
    });
    el.append(
      h("p", { class: "gp-field-help", text: W.playMoney }),
      amounts.el,
      rules.el,
      apply,
      cancel,
      pot,
      note,
    );
    updater = (_next, room) => {
      const v = room?.web3?.stakes,
        on = v && v.mode !== "off",
        active = v && v.status !== "off",
        editable =
          on &&
          ["lobby", "results"].includes(room.phase) &&
          (!active || ["settled", "refunded"].includes(v.status));
      amounts.update(amount, editable && !busy);
      rules.update(rule, editable && !busy);
      apply.disabled = !editable || busy;
      cancel.hidden = !active;
      cancel.disabled =
        !["lobby", "results"].includes(room?.phase) ||
        ["settling", "contested"].includes(v?.status);
      pot.hidden = !v?.explorer;
      if (v?.explorer) pot.href = v.explorer;
      note.textContent = !on
        ? W.unavailable
        : active
          ? `${v.mock ? "MOCK · " : ""}${W.states[v.status] || v.status} · ${(v.funded || []).filter(Boolean).length} funded. ${v.notice || ""}`
          : W.ready;
    };
    destroy = () => {
      amounts.destroy();
      rules.destroy();
    };
  } else if (field.kind === "select") {
    const select = choiceList({
      id,
      label: field.label,
      choices: field.choices,
      change: send,
    });
    updater = (next) => select.update(next.value, next.enabled, next.choices);
    destroy = select.destroy;
    el.append(select.el);
  } else if (field.kind === "pair") {
    const selects = [S.firstPlayer, S.secondPlayer].map((text, i) =>
      choiceList({
        id: `${id}-${i}`,
        label: text,
        change(value) {
          const snapshot = model.snapshot(),
            pair = [...pairFor(snapshot.setup, snapshot.room)];
          pair[i] = value;
          model.change({ pair });
        },
      }),
    );
    el.append(
      h(
        "div",
        { class: "gp-pair" },
        selects.map((select, i) =>
          h(
            "div",
            {},
            h("p", {
              class: "gp-field-help",
              text: i ? S.secondPlayer : S.firstPlayer,
            }),
            select.el,
          ),
        ),
      ),
    );
    updater = (next, room) => {
      const choices = (room?.players || [])
        .filter((player) => player.connected && player.ready)
        .map((player) => [
          player.slot,
          `${SEATS[player.slot].shape} ${player.name}`,
        ]);
      const pair = pairFor(model.snapshot().setup, room);
      selects.forEach((select, i) =>
        select.update(pair[i], next.enabled, choices),
      );
    };
    destroy = () => selects.forEach((select) => select.destroy());
  } else if (field.kind === "phoneText") {
    const words = h("p", { class: "gp-words", "aria-live": "polite" });
    const edit = h("button", {
      type: "button",
      class: "xp-button",
      text: S.editPhone,
      dataset: { nav: "", id: `${id}-edit` },
      async onclick() {
        edit.disabled = true;
        try {
          const answer = await ctx.requestPhoneText?.("customWords");
          if (!answer?.ok) {
            const action = await ctx.wm.modal({
              title: S.editPhone,
              text: answer?.error || S.phoneUnavailable,
              buttons: [
                { id: "players", label: S.openPlayers },
                { id: "cancel", label: S.cancel },
              ],
              cancelButton: "cancel",
            });
            if (action === "players") ctx.openWindow("players");
          }
        } catch (error) {
          reportError(error.message);
        } finally {
          edit.disabled = false;
        }
      },
    });
    updater = (next) => {
      words.textContent =
        Array.isArray(next.value) && next.value.length
          ? next.value.join(" · ")
          : S.noWords;
    };
    el.append(
      words,
      edit,
      h("p", { class: "gp-field-help", text: S.phoneHint }),
    );
  }
  el.append(help);
  return {
    el,
    update(next, room) {
      el.hidden = !next.visible;
      el.classList.toggle("gp-disabled", !next.enabled);
      help.textContent = !next.enabled
        ? next.disabledHelp || ""
        : next.help || "";
      help.hidden = !help.textContent;
      el.title = !next.enabled ? next.disabledHelp || "" : "";
      updater(next, room);
    },
    destroy,
  };
}

export function open(ctx, props = {}) {
  const el = h("div", { class: "gp-view" });
  ctx.window.body.classList.add("gp-window-body");
  ctx.window.el.setAttribute("role", "dialog");
  let model,
    game,
    render,
    controls = [],
    destroyed = false,
    switching = false,
    started = false,
    epoch = 0;
  let state = ctx.store.get();
  const getRoom = () => ctx.store.get().room;
  const reportError = (text) => ctx.wm.modal({ title: S.notYet, text });
  const cancel = () => {
    if (!switching) void ctx.wm.close(ctx.window.id);
  };
  async function start() {
    if (!model || switching || model.snapshot().busy) return;
    const current = model,
      answer = await current.start();
    if (current !== model || destroyed) return;
    if (answer?.ok) {
      started = true;
      await ctx.wm.close(ctx.window.id, { force: true });
    } else if (answer?.error) {
      ctx.mascot?.event("disabled", { reason: answer.error });
      reportError(answer.error);
    }
  }
  function mount(gameId) {
    render = null;
    controls.forEach((control) => control.destroy());
    controls = [];
    model?.destroy();
    game = gameById(gameId);
    started = false;
    ctx.window.el.dataset.game = game.id;
    ctx.wm.setTitle(ctx.window.id, S.title(game.title));
    model = createPropertiesModel({
      gameId: game.id,
      getRoom,
      session: ctx.getSession(),
      storage: ctx.storage,
      onChange: () => render?.(),
      onError: reportError,
    });
    const backdrop = h("div", { class: "gp-backdrop", "aria-hidden": "true" });
    backdrop.style.setProperty("--bg", game.bg);
    backdrop.style.setProperty("--c", game.color);
    // The artwork generator is checked-in static SVG; player text never enters markup.
    backdrop.innerHTML = artwork(game.id);
    const aside = h(
      "aside",
      { class: "gp-taskpane" },
      backdrop,
      h(
        "div",
        { class: "gp-game-description" },
        h("h2", { text: game.verb }),
        h("p", { text: game.detail }),
      ),
    );
    const taskMenu = h("button", {
      type: "button",
      class: "xp-button gp-mobile-tasks",
      text: S.tasks,
      "aria-expanded": "false",
      dataset: { nav: "", id: "gp-task-menu" },
      onclick() {
        toggleTasks(!aside.classList.contains("gp-tasks-open"));
      },
    });
    function toggleTasks(on) {
      aside.classList.toggle("gp-tasks-open", on);
      if (on) aside.dataset.navScope = "active";
      else delete aside.dataset.navScope;
      taskMenu.setAttribute("aria-expanded", String(on));
      if (on) aside.querySelector("button")?.focus();
      else taskMenu.focus();
    }
    aside.addEventListener("os:back", (event) => {
      event.preventDefault();
      toggleTasks(false);
    });
    aside.prepend(
      h("button", {
        type: "button",
        class: "xp-button gp-mobile-tasks",
        text: S.cancel,
        dataset: { nav: "", id: "gp-tasks-close" },
        onclick: () => toggleTasks(false),
      }),
    );
    const taskStart = h("button", {
      type: "button",
      class: "gp-task",
      text: S.start,
      dataset: { nav: "", id: "gp-task-start" },
      onclick: start,
    });
    aside.append(
      h(
        "details",
        { class: "gp-task-group", open: true },
        h("summary", { text: S.tasks, dataset: { nav: "", id: "gp-tasks" } }),
        taskStart,
        h("button", {
          type: "button",
          class: "gp-task",
          text: S.reset,
          dataset: { nav: "", id: "gp-reset" },
          onclick: () => model.preset("standard"),
        }),
        h("button", {
          type: "button",
          class: "gp-task",
          text: S.rules,
          dataset: { nav: "", id: "gp-game-rules" },
          onclick: () =>
            ctx.openWindow("help", { gameId: game.id, keep: true }),
        }),
      ),
    );
    const presetButtons = [];
    if (PRESETS[game.id].length) {
      const presets = h("div", { role: "radiogroup", "aria-label": S.presets });
      for (const choice of [
        ...PRESETS[game.id],
        { id: "mine", label: S.mine },
      ]) {
        const button = h("button", {
          type: "button",
          class: "gp-task gp-preset",
          role: "radio",
          text: choice.label,
          dataset: { nav: "", id: `gp-preset-${choice.id}` },
          onclick: () => model.preset(choice.id),
        });
        presetButtons.push({ choice, button });
        presets.append(button);
      }
      aside.append(
        h(
          "details",
          { class: "gp-task-group", open: true },
          h("summary", {
            text: S.presets,
            dataset: { nav: "", id: "gp-presets" },
          }),
          presets,
        ),
      );
    }
    const groups = optionGroups(game.id),
      tabs = h("div", {
        class: "gp-tabs",
        role: "tablist",
        dataset: { navGroup: "properties-tabs" },
        "aria-label": S.options,
      });
    const main = h("div", { class: "gp-main" }, taskMenu, tabs),
      panes = new Map(),
      tabButtons = new Map();
    let activeTab = "play";
    const tab = (id, focus = false) => {
      activeTab = id;
      for (const [name, button] of tabButtons) {
        button.setAttribute("aria-selected", String(name === id));
        button.tabIndex = name === id ? 0 : -1;
        panes.get(name).hidden = name !== id;
      }
      if (focus) tabButtons.get(id).focus();
    };
    const strip = seatsView(),
      playerStrip = seatsView(),
      summary = h("p", { class: "gp-summary" }),
      hint = h("p", { class: "gp-hint" }),
      queue = h("p", { class: "gp-field-help" });
    const seed = h("p", { class: "gp-seed" }),
      recordHint = h("p", { class: "gp-field-help" });
    const record = h("button", {
      type: "button",
      class: "xp-button",
      text: S.record,
      dataset: { nav: "", id: "gp-record" },
      async onclick() {
        const matchId = getRoom()?.result?.matchId;
        if (!matchId) return;
        record.disabled = true;
        try {
          const answer = await ctx.getSession().record(matchId);
          if (answer?.error) return reportError(answer.error);
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(answer, null, 2)], {
              type: "application/json",
            }),
          );
          const link = h("a", {
            href: url,
            download: `chonks-${matchId}.json`,
          });
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
          if (!destroyed) render();
        }
      },
    });
    for (const group of groups) {
      const button = h("button", {
        type: "button",
        role: "tab",
        id: `gp-tab-${group.id}`,
        text: group.label,
        class: "gp-tab",
        "aria-controls": `gp-page-${group.id}`,
        dataset: { nav: "", id: `gp-tab-${group.id}` },
        onclick: () => tab(group.id),
      });
      const page = h("div", {
        class: "gp-page",
        role: "tabpanel",
        id: `gp-page-${group.id}`,
        "aria-labelledby": button.id,
      });
      tabs.append(button);
      tabButtons.set(group.id, button);
      panes.set(group.id, page);
      main.append(page);
      for (const field of group.fields) {
        const control = fieldControl(field, game, model, ctx, reportError);
        controls.push({ ...control, key: field.key });
        page.append(control.el);
      }
      if (group.id === "play") page.append(summary, strip.el, hint);
      if (group.id === "players") page.append(playerStrip.el, queue);
      if (group.id === "advanced")
        page.append(
          h("h3", { class: "gp-advanced-heading", text: S.lastSeed }),
          seed,
          record,
          recordHint,
        );
    }
    tabs.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      event.stopPropagation();
      const ids = [...tabButtons.keys()],
        at = ids.indexOf(activeTab);
      tab(
        ids[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? ids.length - 1
              : (at + (event.key === "ArrowRight" ? 1 : -1) + ids.length) %
                ids.length
        ],
        true,
      );
    });
    tab("play");
    const statusReason = h("button", {
      type: "button",
      class: "gp-reason-help",
      dataset: { nav: "", id: "gp-reason-help" },
      onclick: () =>
        ctx.mascot?.event("disabled", { reason: statusReason.textContent }),
    });
    const statusReady = h("span");
    const status = h(
      "p",
      {
        id: "gp-status",
        role: "status",
        "aria-live": "polite",
      },
      statusReason,
      statusReady,
    );
    const startButton = h("button", {
      type: "button",
      id: "gp-start",
      text: S.start,
      class: "xp-button xp-default",
      dataset: { nav: "", id: "gp-start" },
      onclick: start,
    });
    const cancelButton = h("button", {
      type: "button",
      id: "gp-cancel",
      text: S.cancel,
      class: "xp-button",
      dataset: { nav: "", id: "gp-cancel" },
      onclick: cancel,
    });
    el.replaceChildren(
      h("div", { class: "gp-body" }, aside, main),
      h(
        "footer",
        { class: "gp-statusrow" },
        status,
        h("div", { class: "gp-footer-actions" }, startButton, cancelButton),
      ),
    );
    render = () => {
      const snapshot = model.snapshot(),
        room = snapshot.room,
        humans = (room?.players || []).filter(
          (p) => p.ready && p.connected,
        ).length;
      const fields = optionFields(game.id, snapshot.setup, humans);
      for (const control of controls)
        control.update(
          fields.find((field) => field.key === control.key),
          room,
        );
      const offline = !["connected", "demo"].includes(state.connection);
      statusReason.textContent = statusReady.textContent = offline
        ? S.connecting
        : snapshot.status.reason;
      statusReason.hidden = !offline && snapshot.status.enabled;
      statusReady.hidden = !statusReason.hidden;
      startButton.disabled = taskStart.disabled =
        offline || switching || snapshot.busy || !snapshot.status.enabled;
      cancelButton.disabled = switching || snapshot.busy;
      summary.textContent = setupSummary(
        game.id,
        snapshot.setup,
        room,
        snapshot.presetName,
      );
      strip.update(room);
      playerStrip.update(room);
      hint.textContent =
        snapshot.setup.mode === "solo" && humans > 1
          ? S.turns
          : !room?.players?.length
            ? S.noPlayers
            : humans === room.players.length
              ? S.everyone
              : S.waiting;
      queue.textContent = room?.queueCount ? S.queue(room.queueCount) : "";
      queue.hidden = !queue.textContent;
      seed.textContent =
        room?.result && room?.match?.seed != null
          ? String(room.match.seed)
          : S.noSeed;
      record.disabled = !room?.result?.matchId;
      recordHint.textContent = record.disabled ? S.noRecord : "";
      recordHint.hidden = !recordHint.textContent;
      for (const { choice, button } of presetButtons) {
        button.setAttribute(
          "aria-checked",
          String(snapshot.presetName === choice.label),
        );
        button.disabled =
          choice.id === "mine" && !ctx.storage?.read(`setup.${game.id}`);
      }
    };
    render();
    requestAnimationFrame(() => {
      if (destroyed || !el.isConnected) return;
      (startButton.disabled
        ? panes.get("play").querySelector("[role=radio][aria-checked=true]") ||
          panes.get("play").querySelector("button")
        : startButton
      )?.focus();
    });
  }
  const keydown = (event) => {
    if (
      event.defaultPrevented ||
      ctx.wm.list().some((entry) => entry.kind === "modal")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    } else if (event.key === "Tab") {
      const items = visibleFocusable(ctx.window.el),
        at = items.indexOf(document.activeElement);
      if (
        items.length &&
        (at < 0 ||
          (event.shiftKey && at === 0) ||
          (!event.shiftKey && at === items.length - 1))
      ) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    }
  };
  ctx.window.el.addEventListener("keydown", keydown);
  mount(props.gameId || getRoom()?.game);
  return {
    el,
    update(next) {
      state = next;
      model.update(next.room);
      if (next.room && !["lobby", "results"].includes(next.room.phase)) {
        started = true;
        void ctx.wm.close(ctx.window.id, { force: true });
      }
    },
    async updateProps(next) {
      const id = gameById(next.gameId || game.id).id;
      if (id === game.id || destroyed) return;
      const issued = ++epoch;
      switching = true;
      render();
      await model.cancel();
      if (destroyed || issued !== epoch) return;
      switching = false;
      mount(id);
    },
    async onClose() {
      if (started) return true;
      const answer = await model.cancel();
      if (answer?.error === "Wait until this round ends.")
        reportError(answer.error);
      return true;
    },
    destroy() {
      destroyed = true;
      epoch++;
      model.destroy();
      controls.forEach((control) => control.destroy());
      ctx.window.el.removeEventListener("keydown", keydown);
      ctx.window.body.classList.remove("gp-window-body");
    },
  };
}
