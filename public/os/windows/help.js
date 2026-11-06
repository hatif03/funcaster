import { games } from "../../../core/catalog.js";
import { h } from "../util/h.js";
import { WINDOW_CONTENT_STRINGS as S } from "../strings.js";
import { utility, button, note, section } from "./utility.js";
export function open(ctx) {
  const page = utility(ctx, S.helpIntro),
    map = h("dl", { class: "os-remote-map" });
  for (const [key, action] of S.remoteMap)
    map.append(h("dt", { text: key }), h("dd", { text: action }));
  const rules = h("div", { class: "os-help-games" });
  for (const game of games.filter((game) => !game.hidden))
    rules.append(
      h(
        "article",
        {},
        h("h3", { text: game.title }),
        h("strong", { text: game.verb }),
        note(game.detail),
        button(`help-${game.id}`, S.openGame, () => ctx.openGame(game.id)),
      ),
    );
  page.content.append(
    section(
      S.joinTitle,
      h(
        "ol",
        {},
        S.joinSteps.map((text) => h("li", { text })),
      ),
    ),
    section(S.remoteTitle, map, note(S.racingHint), note(S.moreHelp)),
    section(S.helpGames, rules),
  );
  page.footer.append(
    button("help-invite", S.openInvite, () => ctx.openWindow("invite")),
  );
  return { el: page.el, update() {}, destroy: page.destroy };
}
