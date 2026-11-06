import {
  games,
  gameById,
  optionSchema,
  matchSetup,
} from "../../core/catalog.js";
import { PROPERTIES_STRINGS as S, WEB3_STRINGS as W } from "./strings.js";

const autoOrInt = (value) =>
  value === "auto" || value == null ? null : Number(value);
const windBool = (value) => value === true || value === "on";
export const OPTION_UI = Object.freeze({
  stakes: { tab: "rules", order: 90, kind: "stakes", label: W.stakes },
  mode: {
    tab: "play",
    order: 10,
    kind: "segments",
    label: S.who,
    help: S.modeHelp,
  },
  cpuCount: {
    tab: "players",
    order: 10,
    kind: "segments",
    coerce: autoOrInt,
    label: (id) => (id === "golf" ? S.golfers : S.racers),
    only: ["mario-kart", "golf"],
    hideChoice: (id, value) => id === "golf" && Number(value) > 4,
  },
  laps: { tab: "rules", order: 10, kind: "segments", only: ["mario-kart"] },
  holes: { tab: "rules", order: 10, kind: "segments", only: ["golf"] },
  golfMode: { tab: "rules", order: 20, kind: "select", only: ["golf"] },
  course: { tab: "rules", order: 30, kind: "segments", only: ["golf"] },
  wind: {
    tab: "rules",
    order: 40,
    kind: "segments",
    coerce: windBool,
    only: ["golf"],
  },
  skill: {
    tab: "players",
    order: 20,
    kind: "segments",
    only: ["golf"],
    enabledIf: (setup) => setup.cpuCount !== 0,
    disabledHelp: S.skillHelp,
  },
  readyGolf: { tab: "advanced", order: 10, kind: "segments", only: ["golf"] },
  turnSeconds: { tab: "advanced", order: 20, kind: "segments", only: ["golf"] },
  variant: { tab: "rules", order: 10, kind: "segments", only: ["fruit-ninja"] },
  bot: {
    tab: "players",
    order: 30,
    kind: "toggle",
    enabledIf: (setup, id) =>
      id === "fruit-ninja"
        ? setup.variant === "co-op"
        : setup.worldMode !== "race",
    disabledHelp: (id) =>
      id === "fruit-ninja" ? S.helperCoop : S.helperShared,
  },
  interaction: {
    tab: "rules",
    order: 10,
    kind: "toggle",
    only: ["star-catch", "bubble-burst", "neon-drift"],
  },
  worldMode: {
    tab: "rules",
    order: 10,
    kind: "segments",
    only: ["shooting-range", "island-flyover", "alien-attack"],
  },
  language: { tab: "rules", order: 20, kind: "select", only: ["drawing"] },
  theme: { tab: "rules", order: 30, kind: "select", only: ["drawing"] },
  drawing: { tab: "rules", order: 10, kind: "segments", only: ["drawing"] },
  customWords: {
    tab: "advanced",
    order: 30,
    kind: "phoneText",
    label: S.customWords,
    only: ["drawing"],
    max: 2050,
  },
  tennisMode: {
    tab: "rules",
    order: 10,
    kind: "segments",
    only: ["table-tennis"],
  },
  winScore: {
    tab: "rules",
    order: 20,
    kind: "segments",
    only: ["table-tennis"],
  },
  rotation: {
    tab: "players",
    order: 10,
    kind: "segments",
    only: ["table-tennis", "swordplay"],
  },
  pair: {
    tab: "players",
    order: 20,
    kind: "pair",
    label: S.pair,
    only: ["table-tennis", "swordplay"],
    visibleIf: (setup) => setup.rotation === "pick",
  },
});
const ready = (room) =>
  (room?.players || []).filter((player) => player.connected && player.ready);
export const defaultSetup = (id, humans = 2) => ({
  ...matchSetup(gameById(id), {}, humans),
  mode: "auto",
  ...(["mario-kart", "golf"].includes(gameById(id).id)
    ? { cpuCount: null }
    : {}),
});
export function effectiveSetup(id, setup = {}, humans = 2) {
  return matchSetup(gameById(id), setup, humans);
}
export function optionValue(id, key, setup = {}, humans = 2) {
  if (key === "mode")
    return ["solo", "multiplayer"].includes(setup.mode) ? setup.mode : "auto";
  if (key === "cpuCount")
    return Number.isInteger(setup.cpuCount) ? setup.cpuCount : "auto";
  if (key === "pair") return Array.isArray(setup.pair) ? setup.pair : [];
  const value = effectiveSetup(id, setup, humans)[key] ?? setup[key];
  return key === "wind" ? (value ? "on" : "off") : value;
}
export function optionFields(
  id,
  setup = {},
  humans = 2,
  schema = optionSchema(gameById(id).id),
) {
  id = gameById(id).id;
  const fields = [...schema];
  for (const key of ["pair", "customWords", "stakes"])
    if (
      (!OPTION_UI[key].only || OPTION_UI[key].only.includes(id)) &&
      !fields.some((field) => field.key === key)
    )
      fields.push({ key, label: OPTION_UI[key].label, choices: [] });
  const normalized = { ...effectiveSetup(id, setup, humans), ...setup };
  return fields
    .map((field, index) => {
      const meta = OPTION_UI[field.key] || {
        tab: "advanced",
        order: 100 + index,
        kind: "select",
      };
      return {
        ...field,
        ...meta,
        label:
          typeof meta.label === "function"
            ? meta.label(id)
            : meta.label || field.label,
        choices: (field.choices || []).filter(
          ([value]) => !meta.hideChoice?.(id, value),
        ),
        value: optionValue(id, field.key, setup, humans),
        visible: meta.visibleIf ? meta.visibleIf(normalized, id) : true,
        enabled: meta.enabledIf ? meta.enabledIf(normalized, id) : true,
        disabledHelp:
          typeof meta.disabledHelp === "function"
            ? meta.disabledHelp(id)
            : meta.disabledHelp,
      };
    })
    .sort((a, b) => a.order - b.order);
}
export function optionGroups(id, setup = {}, humans = 2, schema) {
  const fields = optionFields(id, setup, humans, schema);
  return ["play", "rules", "players", "advanced"]
    .filter(
      (tab) =>
        ["play", "advanced"].includes(tab) ||
        fields.some((field) => field.tab === tab),
    )
    .map((id) => ({
      id,
      label: S.tabs[id],
      fields: fields.filter((field) => field.tab === id),
    }));
}
export function coerceChoice(
  id,
  key,
  value,
  schema = optionSchema(gameById(id).id),
) {
  const choices = schema.find((field) => field.key === key)?.choices || [];
  const selected = choices.find(([choice]) => String(choice) === String(value));
  if (!selected) throw new RangeError(`Invalid ${key} choice`);
  return OPTION_UI[key]?.coerce
    ? OPTION_UI[key].coerce(selected[0])
    : selected[0];
}
const preset = (id, label, setup) => ({ id, label, setup });
export const PRESETS = Object.freeze(
  Object.fromEntries(
    games.map((game) => {
      const entries = {
        "mario-kart": [
          { laps: 1, cpuCount: 0 },
          S.epic,
          { laps: 3, cpuCount: 7 },
        ],
        golf: [
          { holes: 1, wind: false },
          S.fullRound,
          { holes: 6, wind: true, course: "seeded" },
        ],
        "fruit-ninja": [{ variant: "co-op" }, S.versus, { variant: "battle" }],
        drawing: [
          { drawing: "guess", theme: "mixed", language: "en" },
          S.freeDraw,
          { drawing: "free" },
        ],
        "table-tennis": [
          { winScore: 7, tennisMode: "duel" },
          S.longMatch,
          { winScore: 11, rotation: "bracket" },
        ],
        swordplay: [{ rotation: "winner" }, S.bracket, { rotation: "bracket" }],
        "star-catch": [{ interaction: false }, S.rivals, { interaction: true }],
        "bubble-burst": [
          { interaction: false },
          S.rivals,
          { interaction: true },
        ],
        "neon-drift": [{ interaction: false }, S.rivals, { interaction: true }],
        "shooting-range": [
          { worldMode: "race" },
          S.together,
          { worldMode: "shared" },
        ],
        "alien-attack": [
          { worldMode: "race" },
          S.together,
          { worldMode: "coop" },
        ],
        "island-flyover": [
          { worldMode: "race" },
          S.together,
          { worldMode: "shared" },
        ],
      }[game.id];
      return [
        game.id,
        entries
          ? [
              preset("quick", S.quick, entries[0]),
              preset("standard", S.standard, null),
              preset("third", entries[1], entries[2]),
            ]
          : [],
      ];
    }),
  ),
);
export function pairFor(setup, room) {
  return setup.pair?.length === 2
    ? setup.pair
    : ready(room)
        .slice(0, 2)
        .map((player) => player.slot);
}
export function startStatus(room, setup = room?.setup || {}) {
  if (!room) return { enabled: false, reason: S.connecting };
  if (!["lobby", "results"].includes(room.phase))
    return { enabled: false, reason: S.between };
  if (
    ["table-tennis", "swordplay"].includes(room.game) &&
    setup.rotation === "pick"
  ) {
    const pair = pairFor(setup, room);
    if (pair.length === 2 && pair[0] === pair[1])
      return { enabled: false, reason: S.differentPair };
    if (
      pair.length !== 2 ||
      !pair.every((slot) => ready(room).some((p) => p.slot === slot))
    )
      return { enabled: false, reason: S.readyPair };
  }
  return {
    enabled: room.startReason === "Ready to play",
    reason: room.startReason || S.connecting,
  };
}
export function setupSummary(id, setup, room, presetName = S.custom) {
  const humans = ready(room).length,
    match = effectiveSetup(id, setup, humans),
    active = Math.min(humans, match.maxHumans);
  const parts = [];
  if (id === "mario-kart")
    parts.push(S.lapCount(match.laps), S.racerCount(active + match.cpuCount));
  if (id === "golf")
    parts.push(
      S.holeCount(match.holes),
      S.golferCount(active + match.cpuCount),
    );
  parts.push(
    S.playersCount(active),
    match.cpuCount ? S.computerCount(match.cpuCount) : S.humanOnly,
    presetName,
  );
  return parts.join(" · ");
}

/** Draft control keeps a burst of edits atomic and Cancel restores the opening snapshot. */
export function createPropertiesModel({
  gameId,
  getRoom,
  session,
  storage,
  onChange = () => {},
  onError = () => {},
  debounceMs = 150,
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  const id = gameById(gameId).id,
    opening = structuredClone(getRoom()?.setup || {});
  let room = getRoom(),
    pending = {},
    inFlight = {},
    revision = 0,
    timer = null,
    sending = null,
    destroyed = false,
    busy = false,
    presetName = S.standard;
  const base = () => ({ ...(room?.setup || {}), ...inFlight, ...pending });
  const notify = () => onChange(api.snapshot());
  const selectable = session?.select(id);
  if (selectable?.error) onError(selectable.error);
  room = getRoom();
  async function flush() {
    unschedule(timer);
    timer = null;
    if (sending) {
      const answer = await sending;
      if (answer?.error || answer?.cancelled) return answer;
      if (Object.keys(pending).length) return flush();
      return answer;
    }
    if (!Object.keys(pending).length) return { ok: true };
    const changes = pending,
      issuedRevision = revision;
    inFlight = changes;
    pending = {};
    const full = { ...(getRoom()?.setup || room?.setup || {}), ...changes };
    sending = Promise.resolve(session.setup(full));
    let answer;
    try {
      answer = await sending;
      if (answer?.ok && revision === issuedRevision)
        room = { ...room, setup: full };
      else if (answer?.error === "Wait until this round ends.")
        onError(answer.error);
    } finally {
      sending = null;
      inFlight = {};
      if (!destroyed) notify();
    }
    return answer;
  }
  const api = {
    snapshot: () => ({
      gameId: id,
      room,
      setup: base(),
      busy,
      presetName,
      status:
        room?.game === id
          ? startStatus(room, base())
          : { enabled: false, reason: S.connecting },
    }),
    update(next) {
      room = next;
      revision++;
      if (!destroyed) notify();
    },
    change(patch) {
      if (destroyed) return;
      pending = { ...pending, ...patch };
      if (pending.rotation === "pick" && !pending.pair)
        pending.pair = pairFor(base(), room);
      presetName = S.custom;
      unschedule(timer);
      timer = schedule(() => {
        void flush();
      }, debounceMs);
      notify();
    },
    preset(name) {
      const selected = PRESETS[id].find((item) => item.id === name);
      const values =
        name === "mine"
          ? storage?.read(`setup.${id}`)
          : name === "standard"
            ? defaultSetup(id, ready(room).length)
            : selected?.setup;
      if (!values) return false;
      api.change(values);
      presetName = name === "mine" ? S.mine : selected?.label || S.standard;
      notify();
      return true;
    },
    flush,
    async cancel() {
      unschedule(timer);
      timer = null;
      pending = {};
      if (sending) await sending;
      if (destroyed || !["lobby", "results"].includes(getRoom()?.phase))
        return { cancelled: true };
      return session.setup(structuredClone(opening), { replace: true });
    },
    async start() {
      if (busy || destroyed) return { cancelled: true };
      busy = true;
      notify();
      try {
        const saved = base(),
          answer = await flush();
        if (answer?.error) return answer;
        const latest = getRoom() || room;
        const gate =
          latest?.game === id
            ? startStatus(latest, saved)
            : { enabled: false, reason: S.connecting };
        if (!gate.enabled) return { error: gate.reason };
        const result = await session.start();
        if (result?.ok) storage?.write(`setup.${id}`, saved);
        return result;
      } finally {
        await new Promise((resolve) => schedule(resolve, 400));
        busy = false;
        if (!destroyed) notify();
      }
    },
    destroy() {
      destroyed = true;
      unschedule(timer);
      pending = {};
    },
  };
  return api;
}
