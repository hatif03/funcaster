import { GAME_STRINGS as S, WEB3_STRINGS as W } from "../strings.js";
import { resultPresentation } from "../result-data.js";
import { h } from "../util/h.js";
export function open(ctx) {
  const winner = h("h2"),
    subtitle = h("p", { class: "os-result-subtitle" }),
    rankings = h("ol", { class: "os-result-rankings" }),
    standings = h("p", { class: "os-result-standings" }),
    verification = h("p", { class: "os-result-verification" }),
    countdown = h("p", {
      class: "os-result-countdown",
      role: "status",
      "aria-live": "polite",
    });
  let state = ctx.store.get(),
    destroyed = false,
    bypass = false,
    busy = false,
    requestedHold = null,
    signature = null;
  const room = () => ctx.store.get().room;
  const error = (text) => ctx.wm.modal({ title: S.notYet, text });
  const act = async (fn) => {
    if (busy) return;
    busy = true;
    update(state);
    try {
      const answer = await fn();
      if (answer?.error) await error(answer.error);
      return answer;
    } finally {
      busy = false;
      if (!destroyed) update(ctx.store.get());
    }
  };
  const again = h("button", {
    type: "button",
    text: S.again,
    class: "xp-button xp-default",
    dataset: { nav: "", id: "results-again" },
    onclick: () => act(() => ctx.getSession().start()),
  });
  const options = h("button", {
    type: "button",
    text: S.changeOptions,
    class: "xp-button",
    dataset: { nav: "", id: "results-options" },
    onclick: async () => {
      if (busy) return;
      const id = room()?.game;
      bypass = true;
      await ctx.wm.close(ctx.window.id, { force: true });
      ctx.openGame(id);
    },
  });
  const back = h("button", {
    type: "button",
    text: S.desktop,
    class: "xp-button",
    dataset: { nav: "", id: "results-desktop" },
    onclick: () => act(() => ctx.getSession().lobby()),
  });
  const save = h("button", {
    type: "button",
    text: S.save,
    class: "xp-button",
    dataset: { nav: "", id: "results-save" },
    onclick: () =>
      act(async () => {
        const matchId = room()?.result?.matchId;
        if (!matchId) return;
        const answer = await ctx.getSession().record(matchId);
        if (answer?.error) return answer;
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(answer, null, 2)], {
            type: "application/json",
          }),
        );
        h("a", { href: url, download: `chonks-${matchId}.json` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true };
      }),
  });
  const reason = h("p", { class: "os-result-start-reason" });
  const stakesStatus = h("p", {
    role: "status",
    class: "os-result-verification",
    hidden: true,
  });
  const potLink = h("a", {
    class: "xp-button",
    text: W.pot,
    target: "_blank",
    rel: "noopener",
    hidden: true,
    dataset: { nav: "", id: "results-open-pot" },
  });
  const scroll = h(
    "div",
    { class: "os-results-scroll" },
    winner,
    subtitle,
    rankings,
    standings,
    verification,
    stakesStatus,
    potLink,
    countdown,
  );
  const el = h(
    "div",
    { class: "os-results" },
    scroll,
    reason,
    h("footer", { class: "os-result-actions" }, again, options, back, save),
  );
  ctx.window.body.classList.add("os-results-body");
  function update(next) {
    state = next;
    const current = next.room;
    if (!current) return;
    const key = JSON.stringify([
      current.result,
      current.standings,
      current.bracket,
      current.players.map((p) => [p.slot, p.name]),
      current.game,
      current.match,
      current.web3?.stakes,
      current.web3?.receipts?.[current.result?.matchId],
    ]);
    if (key !== signature) {
      signature = key;
      const data = resultPresentation(current);
      winner.textContent = data.winner;
      subtitle.textContent = data.subtitle;
      standings.textContent = data.standings;
      standings.hidden = !data.standings;
      verification.textContent = data.verification;
      verification.hidden = !data.verification;
      const stakes = current.web3?.stakes;
      const staked =
        stakes?.matchId === current.result?.matchId && !!stakes?.potId;
      stakesStatus.hidden = !staked;
      stakesStatus.textContent = staked
        ? `${W.playMoney} · ${stakes.mock ? "MOCK · " : ""}${W.states[stakes.status] || stakes.status}${stakes.status === "settled" && !stakes.claimsComplete ? ` · ${W.claiming}` : ""}`
        : "";
      potLink.hidden = !staked || !stakes.explorer;
      if (staked && stakes.explorer) potLink.href = stakes.explorer;
      rankings.replaceChildren(
        ...data.ranked.map((player) => {
          const badge = h("span", {
            class: "os-result-seat",
            text: player.shape,
            "aria-hidden": "true",
          });
          badge.style.setProperty("--seat", player.color);
          const details = h(
            "div",
            { class: "os-result-name" },
            h("strong", { text: `${player.rank}. ${player.name}` }),
            player.statsLine ? h("small", { text: player.statsLine }) : null,
          );
          const score = h(
            "div",
            { class: "os-result-score" },
            h("strong", {
              text: player.outcomeLabel || String(player.displayScore),
            }),
            player.outcomeLabel ? null : h("small", { text: data.unit }),
          );
          return h(
            "li",
            { dataset: { outcome: player.outcome || "finished" } },
            badge,
            h("span", {
              class: "os-result-avatar",
              dataset: {
                avatarSlot: String(player.slot),
                avatarWinner: String(
                  current.result?.status !== "no-contest" &&
                    player.rank === 1 &&
                    (!player.outcome || player.outcome === "finished"),
                ),
                avatarEmpty: "false",
              },
            }),
            details,
            score,
          );
        }),
      );
    }
    again.disabled =
      busy ||
      current.phase !== "results" ||
      current.startReason !== "Ready to play" ||
      !["connected", "demo"].includes(next.connection);
    again.title = again.disabled ? current.startReason || "" : "";
    reason.textContent =
      current.startReason !== "Ready to play" ? current.startReason || "" : "";
    reason.hidden = !reason.textContent;
    options.disabled = back.disabled = busy;
    save.disabled = busy || !current.result?.matchId;
    clock();
  }
  function focused() {
    return (
      ctx.window.el.contains(document.activeElement) &&
      !ctx.window.el.hidden &&
      document.visibilityState !== "hidden"
    );
  }
  function clock() {
    const current = room();
    if (!current || destroyed) return;
    const hold =
      current.phase === "results" &&
      current.operatingMode !== "kiosk" &&
      focused();
    if (hold !== requestedHold && current.phase === "results") {
      requestedHold = hold;
      void Promise.resolve(ctx.getSession().resultHold?.(hold)).then(
        (answer) => {
          if (answer?.error && !destroyed && room()?.phase === "results")
            requestedHold = null;
        },
      );
    }
    const remaining = Math.ceil(
      (current.resultsHeld
        ? current.resultsRemainingMs || 0
        : ctx.gameHost.remainingMs(current.endsAt)) / 1000,
    );
    countdown.textContent =
      hold || current.resultsHeld ? S.resultHeld : S.returnIn(remaining);
  }
  const focus = () => queueMicrotask(clock);
  document.addEventListener("focusin", focus);
  document.addEventListener("visibilitychange", clock);
  const timer = setInterval(clock, 250);
  update(state);
  requestAnimationFrame(() => {
    if (!destroyed) {
      (again.disabled ? options : again).focus();
      clock();
    }
  });
  return {
    el,
    update,
    async onClose() {
      if (bypass || room()?.phase !== "results") return true;
      const answer = await ctx.getSession().lobby();
      if (answer?.error) {
        error(answer.error);
        return false;
      }
      return true;
    },
    destroy() {
      destroyed = true;
      if (requestedHold && room()?.phase === "results")
        void ctx.getSession().resultHold?.(false);
      clearInterval(timer);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", clock);
      ctx.window.body.classList.remove("os-results-body");
    },
  };
}
