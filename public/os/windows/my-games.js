import { games } from "../../../core/catalog.js";
const listed = () => games.filter((game) => !game.hidden);
import { h } from "../util/h.js";
import { gameIcon } from "../icon-crop.js";
import { DESKTOP_STRINGS as S } from "../strings.js";
export function open(ctx) {
  const pane = h(
    "aside",
    { class: "os-explorer-tasks" },
    h("h2", { text: S.games }),
  );
  for (const [id, label] of [
    ["playlists", S.playlists],
    ["records", S.records],
  ])
    pane.append(
      h("button", {
        class: "xp-button",
        text: label,
        dataset: { nav: "", id: `explorer-${id}` },
        onclick: () => ctx.openWindow(id),
      }),
    );
  pane.append(
    h("button", {
      class: "xp-button",
      text: S.random,
      dataset: { nav: "", id: "random-game" },
      onclick: () =>
        ctx.openGame(listed()[Math.floor(Math.random() * listed().length)].id),
    }),
  );
  const board = h("ol", { class: "os-explorer-board" });
  pane.append(h("h2", { text: S.leaderboard }), board);
  const grid = h("div", {
    class: "os-explorer-grid",
    dataset: { navGrid: "my-games" },
  });
  const scoreLabels = new Map();
  for (const game of listed()) {
    const score = h("span", { class: "os-last-score" });
    scoreLabels.set(game.id, score);
    grid.append(
      h(
        "button",
        {
          class: "os-explorer-game",
          title: game.detail,
          dataset: { nav: "", id: `explorer-${game.id}` },
          onclick: () => ctx.openGame(game.id),
        },
        gameIcon(game),
        h("strong", { text: game.title }),
        h("span", { text: game.players || "1–4 players" }),
        score,
      ),
    );
  }
  const el = h("div", { class: "os-explorer" }, pane, grid);
  let signature;
  function update(state) {
    for (const [id, label] of scoreLabels) {
      const value = ctx.storage.read(`last-score.${id}`, null);
      label.textContent = Number.isFinite(value?.score)
        ? S.lastScore(value.score, value.unit || "")
        : S.notPlayed;
    }
    const list = state.room?.leaderboard || [],
      key = JSON.stringify(list);
    if (key === signature) return;
    signature = key;
    board.replaceChildren(
      ...(list.length
        ? list.map((entry) =>
            h("li", { text: `${entry.name} · ${entry.score}` }),
          )
        : [h("li", { text: S.noScores })]),
    );
  }
  update(ctx.store.get());
  return { el, update, destroy() {} };
}
