import { BRAND } from "../brand.js";
import { DESKTOP_STRINGS as S } from "../strings.js";
import { h } from "../util/h.js";
import { gameIcon } from "../icon-crop.js";
export function mountStartMenu(
  root,
  {
    theme,
    games,
    storage,
    button,
    onGame,
    onWindow,
    onAction,
    onScope = () => {},
  },
) {
  let open = false,
    all = false;
  const heading = h("strong"),
    crew = h("span");
  const left = h("div", { class: "os-menu-games" }),
    right = h("div", { class: "os-menu-system" });
  const lock = h("button", {
    text: S.lock,
    dataset: { nav: "", id: "menu-lock" },
    onclick() {
      close();
      onAction("lock");
    },
  });
  const restart = h("button", {
    text: S.restart,
    dataset: { nav: "", id: "menu-restart" },
    onclick() {
      close();
      onAction("restart");
    },
  });
  const el = h(
    "section",
    { class: "os-start-menu", hidden: true, "aria-label": BRAND.os },
    h(
      "header",
      {},
      h("img", { src: theme.icon("players.crew"), alt: "" }),
      h("div", {}, heading, crew),
    ),
    h("div", { class: "os-menu-columns" }, left, right),
    h(
      "footer",
      {},
      lock,
      restart,
      h("button", {
        text: S.shutdown,
        dataset: { nav: "", id: "menu-shutdown" },
        onclick() {
          close();
          onAction("shutdown");
        },
      }),
    ),
  );
  root.append(el);
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  for (const [id, label, icon] of [
    ["my-games", S.myGames, "folder.my-games"],
    ["players", S.players, "players.crew"],
    ["invite", S.invite, "invite.network"],
    ["playlists", S.playlists, "playlists.media"],
    ["records", S.records, "records.history"],
    ["live", "Funcaster Live", "invite.network"],
    ["settings", S.settings, "settings"],
    ["help", S.help, "help"],
  ])
    right.append(
      h(
        "button",
        {
          text: "",
          dataset: { nav: "", id: `menu-${id}` },
          onclick() {
            close();
            onWindow(id);
          },
        },
        h("img", { src: theme.icon(icon), alt: "" }),
        h("span", { text: label }),
      ),
    );
  function gameRow(game) {
    return h(
      "button",
      {
        title: game.verb,
        dataset: { nav: "", id: `menu-game-${game.id}` },
        onclick() {
          close();
          onGame(game.id);
        },
      },
      gameIcon(game),
      h("span", { text: game.title }),
    );
  }
  function renderGames() {
    left.replaceChildren(h("h2", { text: all ? S.allGames : S.favourites }));
    for (const game of all ? games : games.slice(0, 4))
      left.append(gameRow(game));
    if (!all) {
      const recent = storage
        .read("recent-games", [])
        .map((id) => games.find((game) => game.id === id))
        .filter(Boolean)
        .slice(0, 2);
      left.append(
        h("h2", { text: S.recent }),
        ...(recent.length
          ? recent.map(gameRow)
          : [h("p", { text: S.noRecent })]),
      );
    }
    left.append(
      h("button", {
        class: "os-menu-all",
        text: all ? S.desktopAction : `${S.allGames} ›`,
        dataset: { nav: "", id: "menu-all-games" },
        onclick() {
          all = !all;
          renderGames();
          left.querySelector("button")?.focus();
        },
      }),
    );
  }
  function close() {
    if (!open) return;
    open = false;
    el.hidden = true;
    button.setAttribute("aria-expanded", "false");
    onScope(null);
    button.focus();
  }
  function outside(event) {
    if (open && !el.contains(event.target) && event.target !== button) close();
  }
  function key(event) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      const items = [...el.querySelectorAll("button:not([disabled])")];
      const i = items.indexOf(document.activeElement);
      if (
        i < 0 ||
        (!event.shiftKey && i === items.length - 1) ||
        (event.shiftKey && i === 0)
      ) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0]?.focus();
      }
    }
  }
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", key);
  return {
    el,
    close,
    toggle() {
      if (open) {
        close();
        return;
      }
      open = true;
      all = false;
      renderGames();
      el.hidden = false;
      button.setAttribute("aria-expanded", "true");
      onScope(el);
      left.querySelector("button")?.focus();
    },
    isOpen: () => open,
    update(state) {
      const room = state.room;
      right.querySelector('[data-id="menu-live"]').hidden = !room?.web3;
      heading.textContent = S.room(room?.code);
      crew.textContent = S.crew(
        room?.players?.filter((p) => p.connected).length || 0,
      );
      lock.textContent = room?.locked ? S.unlock : S.lock;
      lock.disabled = !room;
      restart.disabled =
        !room ||
        !["classic", "practice", "countdown", "playing"].includes(room.phase);
    },
    destroy() {
      close();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      el.remove();
    },
  };
}
