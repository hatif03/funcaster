import { DESKTOP_STRINGS as S } from "../strings.js";
export function windowManifest(theme) {
  const data = [
    ["my-games", S.myGames, "folder.my-games", 640, 460],
    ["shutdown", S.shutdownTitle, "power.shutdown", 440, 330],
    ["game-properties", S.properties, "folder.my-games", 760, 520],
    ["players", S.players, "players.crew", 560, 420],
    ["invite", S.invite, "invite.network", 520, 560],
    ["playlists", S.playlists, "playlists.media", 480, 380],
    ["records", S.records, "records.history", 520, 400],
    ["live", "Funcaster Live", "invite.network", 700, 560],
    ["settings", S.settings, "settings", 560, 440],
    ["help", S.help, "help", 640, 480],
    ["diagnostics", S.diagnostics, "diagnostics", 560, 420],
    ["recycle-bin", S.recycle, "recycle.empty", 480, 320],
  ];
  return data.map(([id, title, icon, w, h]) => ({
    id,
    title,
    icon: theme.icon(icon),
    size: { w, h },
    kind: "tool",
    singleton: true,
    async open(ctx, props) {
      const module = await import(`./${id}.js`);
      return module.open(ctx, props);
    },
  }));
}
