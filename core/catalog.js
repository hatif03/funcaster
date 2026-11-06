import { cleanWords } from "./drawing-words.js";
export const games = [
  {
    id: "mario-kart",
    title: "Kart Rush",
    verb: "Your phone. Your steering wheel.",
    detail: "Hold Accelerate. Tilt gently to steer. Boost out of the pack.",
    color: "#d74842",
    bg: "#ffe5d8",
    icon: "↝",
    mode: "wheel",
    classic: true,
    players: "1–4 drivers",
    tag: "THE STARTING GRID",
    duration: "1 or 3 laps",
    action: "Start race",
  },
  {
    id: "star-catch",
    title: "Star Catch",
    verb: "Tilt to catch.",
    detail: "Catch the stars. Dodge the pink comets.",
    color: "#7357f5",
    bg: "#eeeaff",
    icon: "✦",
    target: 180,
    mode: "side",
    tag: "EASY TO LOVE",
  },
  {
    id: "neon-drift",
    title: "Neon Drift",
    verb: "Tilt to steer.",
    detail:
      "Hold Accelerate. Grab rings, dodge blocks, and tap Boost for a burst.",
    color: "#178878",
    bg: "#e0f5e9",
    icon: "↝",
    target: 250,
    mode: "wheel",
    tag: "A LITTLE COMPETITIVE",
  },
  {
    id: "bubble-burst",
    title: "Bubble Burst",
    verb: "Tilt to pop.",
    detail: "Float over bubbles to pop them. A gentle flick adds a burst.",
    color: "#e57050",
    bg: "#ffebe2",
    icon: "◌",
    target: 250,
    mode: "aim",
    tag: "HAPPY LITTLE CHAOS",
  },
];
games.push(
  {
    id: "fruit-ninja",
    title: "Slice Dojo",
    verb: "Tilt. Slice. Repeat.",
    detail: "Slice the fruit together. Watch out for bombs.",
    color: "#377d49",
    bg: "#e4f2d4",
    icon: "✳",
    mode: "aim",
    classic: true,
    players: "1–4 players",
    tag: "SLICE TOGETHER",
    duration: "Arcade rounds",
    action: "Start slicing",
  },
  {
    id: "alien-attack",
    title: "Alien Attack",
    verb: "Tilt to dodge. Tap to fire.",
    detail: "Dodge the invaders and blast your way through.",
    color: "#6661b8",
    bg: "#e9e6ff",
    icon: "✧",
    mode: "side",
    classic: true,
    players: "1–4 players",
    tag: "SPACE FOR A HERO",
    duration: "Arcade run",
    action: "Fire",
  },
  {
    id: "shooting-range",
    title: "Shooting Range",
    verb: "Aim with a little tilt.",
    detail: "Find a target. Tap Fire. Beat your best.",
    color: "#a35f35",
    bg: "#f6e6c9",
    icon: "◎",
    mode: "aim",
    classic: true,
    players: "1–4 players",
    tag: "NICE SHOT",
    duration: "Target challenge",
    action: "Fire",
  },
  {
    id: "drawing",
    title: "Drawing",
    verb: "Make a little masterpiece.",
    detail: "Tilt to draw. Tap to lift or lower your pen.",
    color: "#b15986",
    bg: "#f9e1ee",
    icon: "〰",
    mode: "aim",
    classic: true,
    players: "1–4 artists",
    tag: "DRAW A LITTLE. GUESS A LOT.",
    duration: "Draw & guess / free draw",
    action: "Pen up / down",
  },
);

games.push(
  {
    id: "golf",
    title: "Pocket Greens",
    verb: "Aim. Tap. Take your shot.",
    detail:
      "Tilt to aim. Hold to build power, release to putt. Lowest score wins.",
    color: "#377d49",
    bg: "#e4f2d4",
    icon: "⚑",
    mode: "aim",
    classic: true,
    tag: "TAKE YOUR TIME",
    duration: "3 holes",
    action: "Take shot",
  },
  {
    id: "table-tennis",
    title: "Table Tennis",
    verb: "A little tilt. A great rally.",
    detail: "Move your paddle with a tilt. First to 7 wins.",
    color: "#218779",
    bg: "#e0f5e9",
    icon: "◒",
    mode: "aim",
    classic: true,
    tag: "ONE MORE RALLY",
    duration: "First to 7",
    action: "Power return",
  },
  {
    id: "swordplay",
    title: "Foam Fencers",
    verb: "Block. Swoosh. Smile.",
    detail: "Tilt to guard. Tap to strike. Keep your phone close.",
    color: "#9760b9",
    bg: "#efe1f9",
    icon: "⚔",
    mode: "aim",
    classic: true,
    tag: "A FRIENDLY DUEL",
    duration: "First to 3",
    action: "Strike",
  },
  {
    id: "kart",
    title: "Time Trial",
    verb: "Find your fastest lap.",
    detail: "Hold Accelerate. Tilt to steer. Race the clock with your crew.",
    color: "#dc7449",
    bg: "#ffe8da",
    icon: "↝",
    mode: "wheel",
    classic: true,
    tag: "CHASE YOUR BEST",
    duration: "3 laps",
    action: "Start driving",
  },
  {
    id: "island-flyover",
    title: "Cloud Cruise",
    verb: "Tilt into the blue.",
    detail:
      "Tilt left and right to bank. Tilt forward and back to climb and dive.",
    color: "#3884b0",
    bg: "#dff1fa",
    icon: "✈",
    mode: "flight",
    classic: true,
    tag: "ROOM TO ROAM",
    duration: "20 checkpoints",
    action: "Take off",
  },
);
const twoPlayer = new Set(["table-tennis", "swordplay"]);
const split = new Set([
  "mario-kart",
  "kart",
  "island-flyover",
  "alien-attack",
  "shooting-range",
]);
const order = [
  "mario-kart",
  "golf",
  "fruit-ninja",
  "star-catch",
  "neon-drift",
  "bubble-burst",
  "table-tennis",
  "swordplay",
  "kart",
  "island-flyover",
  "shooting-range",
  "alien-attack",
  "drawing",
];
for (const game of games) {
  const max = twoPlayer.has(game.id) ? 2 : 4;
  Object.assign(game, {
    schemaVersion: 2,
    gameId: `chonks.${game.id === "mario-kart" ? "kart-rush" : game.id}`,
    version: "1.0.0",
    order: order.indexOf(game.id),
    hidden: ["golf", "fruit-ninja", "kart", "swordplay"].includes(game.id),
    maxPlayers: max,
    controller: game.mode,
    view: split.has(game.id) ? "split" : "shared",
    verification: [
      "star-catch",
      "neon-drift",
      "bubble-burst",
      "fruit-ninja",
    ].includes(game.id)
      ? "verifiable"
      : "attested",
    scoring: {
      direction: ["golf", "mario-kart"].includes(game.id) ? "lower" : "higher",
      unit:
        game.id === "golf"
          ? "strokes"
          : game.id === "mario-kart"
            ? "place"
            : "points",
    },
    modes: {
      solo: {
        minHumans: 1,
        maxHumans: 1,
        aiDefault:
          game.id === "mario-kart" ? 7 : twoPlayer.has(game.id) ? 1 : 0,
      },
      multiplayer: { minHumans: 2, maxHumans: max, aiDefault: 0 },
    },
    topologies: ["shared", "remote", "hybrid", "spectator"],
    players: twoPlayer.has(game.id)
      ? "1–2 · crew rotation"
      : game.players || "1–4 players",
    input: {
      x: [-1, 1],
      y: [-1, 1],
      actions: ["primary", "left", "right", "confirm"],
    },
  });
}
const neutralIds = {
  "mario-kart": "kart-rush",
  golf: "pocket-greens",
  "fruit-ninja": "slice-dojo",
  swordplay: "foam-fencers",
  kart: "time-trial",
  "island-flyover": "cloud-cruise",
};
for (const game of games) {
  game.legacyIds = [...new Set([game.gameId, `chonks.${game.id}`])];
  game.gameId = `chonks.${neutralIds[game.id] || game.id}`;
  game.seats = game.maxPlayers;
  game.engine = game.classic ? "classic" : "server";
  game.seatView = [
    "kart",
    "island-flyover",
    "alien-attack",
    "shooting-range",
  ].includes(game.id)
    ? "independent"
    : game.id === "mario-kart"
      ? "split"
      : "shared";
  game.remote = !game.classic
    ? "frames"
    : game.seatView === "independent"
      ? "views"
      : ["mario-kart", "table-tennis", "swordplay"].includes(game.id)
        ? "preview"
        : "snapshot";
  game.roundPolicy = {
    kind: ["golf", "drawing"].includes(game.id)
      ? "turnBased"
      : ["mario-kart", "kart", "island-flyover", "alien-attack"].includes(
            game.id,
          )
        ? "untilDone"
        : "timed",
    hardCapMs:
      game.id === "golf"
        ? 1800000
        : game.id === "mario-kart"
          ? 600000
          : ["kart", "island-flyover", "alien-attack"].includes(game.id)
            ? 300000
            : game.id === "drawing"
              ? 180000
              : game.classic
                ? 120000
                : 60000,
    finishWindowMs: 30000,
    idleMs: 30000,
    graceMs: 30000,
  };
  if (
    ["mario-kart", "golf", "fruit-ninja", "table-tennis", "swordplay"].includes(
      game.id,
    )
  )
    game.version = "1.1.0";
  if (
    [
      "golf",
      "mario-kart",
      "table-tennis",
      "swordplay",
      "kart",
      "island-flyover",
      "shooting-range",
      "alien-attack",
    ].includes(game.id)
  ) {
    game.verification = "verifiable";
    game.version = "1.1.0";
  }
  if (["star-catch", "bubble-burst", "neon-drift", "drawing"].includes(game.id))
    game.version = "1.1.0";
  game.scoring.integer = true;
  game.statsSchema =
    game.id === "fruit-ninja"
      ? ["fruit", "bestCombo", "bombs"]
      : game.id === "golf"
        ? ["strokes", "holes", "points"]
        : game.id === "mario-kart"
          ? ["finishMs", "boostsUsed"]
          : [];
  game.scoring.tieBreak =
    game.scoring.unit === "place" ? "finish time" : "shared place";
}
export const sharedWorld = (id, setup = {}) =>
  ["shooting-range", "island-flyover", "alien-attack"].includes(id) &&
  ["shared", "steal", "coop", "versus"].includes(setup.worldMode);
export const independentViews = (id, setup = {}) => {
  if (sharedWorld(id, setup)) return false;
  const game = gameById(id);
  return (
    game.seatView === "independent" ||
    (game.id === "fruit-ninja" && setup?.variant === "race")
  );
};
export function optionSchema(id) {
  const fields = [
    {
      key: "mode",
      label: "Players",
      choices: [
        ["auto", "Everyone ready"],
        ["solo", "Solo"],
        ["multiplayer", "Multiplayer · 2+ ready"],
      ],
    },
  ];
  if (["star-catch", "bubble-burst", "neon-drift"].includes(id))
    fields.push({
      key: "interaction",
      label: "Play together",
      choices: [
        [false, "Independent lanes"],
        [
          true,
          id === "neon-drift" ? "Rival slipstream" : "First to claim pickups",
        ],
      ],
    });
  if (["shooting-range", "island-flyover", "alien-attack"].includes(id))
    fields.push({
      key: "worldMode",
      label: "Play together",
      choices: [
        ["race", "Same-seed race"],
        ...(id === "alien-attack"
          ? [
              ["coop", "One patrol · co-op"],
              ["versus", "One patrol · versus"],
            ]
          : id === "shooting-range"
            ? [
                ["shared", "Shared targets"],
                ["steal", "Tag & steal"],
              ]
            : [["shared", "First to claim rings"]]),
      ],
    });
  if (["mario-kart", "golf"].includes(id))
    fields.push({
      key: "cpuCount",
      label: "Computer players",
      choices: [
        ["auto", "Solo default"],
        [0, "None"],
        [2, "2"],
        [4, "4"],
        ...(id === "mario-kart" ? [[7, "Fill grid"]] : []),
      ],
    });
  if (id === "mario-kart")
    fields.push({
      key: "laps",
      label: "Laps",
      choices: [
        [1, "1 lap"],
        [3, "3 laps"],
      ],
    });
  if (id === "golf")
    fields.push({
      key: "holes",
      label: "Holes",
      choices: [
        [1, "1 hole"],
        [3, "3 holes"],
        [6, "6 holes"],
      ],
    });
  if (id === "fruit-ninja")
    fields.push({
      key: "variant",
      label: "Mode",
      choices: [
        ["co-op", "Co-op"],
        ["battle", "Battle"],
        ["race", "Race"],
      ],
    });
  if (id === "drawing")
    fields.push(
      {
        key: "language",
        label: "Word language",
        choices: [
          ["en", "English"],
          ["hi", "हिन्दी"],
          ["hinglish", "Hinglish"],
        ],
      },
      {
        key: "theme",
        label: "Word theme",
        choices: [
          ["mixed", "Mixed bag"],
          ["nature", "Nature"],
          ["food", "Food"],
          ["things", "Everyday things"],
        ],
      },
    );
  if (id === "table-tennis")
    fields.push({
      key: "tennisMode",
      label: "Team",
      choices: [
        ["duel", "Head to head"],
        ["coop", "Two paddles vs computer"],
      ],
    });
  if (["shooting-range", "alien-attack"].includes(id))
    fields.push({
      key: "bot",
      label: "Practice helper",
      choices: [
        [false, "Humans only"],
        [
          true,
          id === "shooting-range"
            ? "Bot crosshair · shared modes"
            : "Wingman · shared modes",
        ],
      ],
    });
  if (id === "fruit-ninja")
    fields.push({
      key: "bot",
      label: "Practice helper",
      choices: [
        [false, "Humans only"],
        [true, "Co-op helper blade"],
      ],
    });
  if (id === "table-tennis")
    fields.push({
      key: "winScore",
      label: "Points to win",
      choices: [
        [7, "First to 7"],
        [11, "First to 11"],
      ],
    });
  if (id === "golf")
    fields.push(
      {
        key: "readyGolf",
        label: "Turn order",
        choices: [
          [false, "In order"],
          [true, "Ready golf after 20s"],
        ],
      },
      {
        key: "turnSeconds",
        label: "Turn timer",
        choices: [
          [30, "30 seconds"],
          [45, "45 seconds"],
          [60, "60 seconds"],
          [90, "90 seconds"],
        ],
      },
    );
  if (id === "drawing")
    fields.push({
      key: "drawing",
      label: "Mode",
      choices: [
        ["guess", "Draw & guess"],
        ["free", "Free draw"],
        ["vote", "Draw, then vote"],
      ],
    });
  if (["table-tennis", "swordplay"].includes(id))
    fields.push({
      key: "rotation",
      label: "Rotation",
      choices: [
        ["winner", "Winner stays"],
        ["pick", "Pick two"],
        ["bracket", "Bracket"],
      ],
    });

  if (id === "golf")
    fields.push(
      {
        key: "golfMode",
        label: "Scoring",
        choices: [
          ["stroke", "Stroke play"],
          ["match", "Match play · 2v2 with four"],
          ["skins", "Skins"],
          ["closest", "Closest to pin"],
          ["scramble", "Team scramble"],
        ],
      },
      {
        key: "course",
        label: "Course",
        choices: [
          ["classic", "Classic"],
          ["seeded", "Seeded tees & pins"],
        ],
      },
      {
        key: "wind",
        label: "Wind",
        choices: [
          ["off", "Calm"],
          ["on", "Breezy"],
        ],
      },
      {
        key: "skill",
        label: "Computer skill",
        choices: [
          ["rookie", "Rookie"],
          ["club", "Club"],
          ["pro", "Pro"],
        ],
      },
    );
  return fields;
}
games.sort((a, b) => a.order - b.order);
export const gameById = (id) =>
  games.find(
    (g) => g.id === id || g.gameId === id || g.legacyIds.includes(id),
  ) || games[0];
export function validateManifest(g) {
  const errors = [];
  if (g?.schemaVersion !== 2) errors.push("schemaVersion must be 2");
  if (!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(g?.gameId || ""))
    errors.push("gameId must be namespaced");
  if (!/^\d+\.\d+\.\d+$/.test(g?.version || ""))
    errors.push("version must be semantic");
  if (!g?.title || g.title.length > 64)
    errors.push("title must be 1–64 characters");
  if (!["shared", "split"].includes(g?.view))
    errors.push("unknown view policy");
  if (!["verifiable", "attested", "casual"].includes(g?.verification))
    errors.push("unknown verification tier");
  if (!["aim", "side", "wheel", "flight"].includes(g?.controller))
    errors.push("unknown controller profile");
  if (
    !["higher", "lower"].includes(g?.scoring?.direction) ||
    typeof g?.scoring?.unit !== "string" ||
    g.scoring.unit.length > 24
  )
    errors.push("invalid scoring contract");
  if (
    !Array.isArray(g?.topologies) ||
    !g.topologies.length ||
    g.topologies.some(
      (t) => !["shared", "remote", "hybrid", "spectator"].includes(t),
    )
  )
    errors.push("invalid topology");
  for (const name of ["solo", "multiplayer"]) {
    const m = g?.modes?.[name];
    if (
      !m ||
      !Number.isInteger(m.minHumans) ||
      !Number.isInteger(m.maxHumans) ||
      m.minHumans < 1 ||
      m.maxHumans > 4 ||
      m.minHumans > m.maxHumans
    )
      errors.push(`invalid ${name} seats`);
    if (name === "multiplayer" && m?.minHumans < 2)
      errors.push("multiplayer needs two humans");
  }
  return errors;
}
export function matchSetup(game, requested = {}, humans = 1) {
  const mode =
    requested.mode === "solo"
      ? "solo"
      : requested.mode === "multiplayer"
        ? "multiplayer"
        : humans > 1
          ? "multiplayer"
          : "solo";
  const rules = game.modes[mode];
  return {
    mode,
    minHumans: rules.minHumans,
    maxHumans: rules.maxHumans,
    cpuCount: ["mario-kart", "golf"].includes(game.id)
      ? Math.max(
          0,
          Math.min(
            game.id === "golf" ? 4 : 8 - Math.min(humans, rules.maxHumans),
            Number.isInteger(requested.cpuCount)
              ? requested.cpuCount
              : rules.aiDefault,
          ),
        )
      : rules.aiDefault,

    golfMode: ["stroke", "match", "skins", "closest", "scramble"].includes(
      requested.golfMode,
    )
      ? requested.golfMode
      : "stroke",
    skill: ["rookie", "club", "pro"].includes(requested.skill)
      ? requested.skill
      : "club",
    course: requested.course === "seeded" ? "seeded" : "classic",
    wind: requested.wind === true || requested.wind === "on",
    readyGolf: requested.readyGolf === true,
    turnSeconds: [0, 30, 45, 60, 90].includes(requested.turnSeconds)
      ? requested.turnSeconds
      : 45,
    worldMode: (
      {
        "shooting-range": ["shared", "steal"],
        "island-flyover": ["shared"],
        "alien-attack": ["coop", "versus"],
      }[game.id] || []
    ).includes(requested.worldMode)
      ? requested.worldMode
      : "race",
    drawing: ["free", "vote"].includes(requested.drawing)
      ? requested.drawing
      : "guess",
    language: ["en", "hi", "hinglish"].includes(requested.language)
      ? requested.language
      : "en",
    theme: ["nature", "food", "things"].includes(requested.theme)
      ? requested.theme
      : "mixed",
    customWords: cleanWords(requested.customWords),
    tennisMode: requested.tennisMode === "coop" ? "coop" : "duel",
    bot: requested.bot === true,
    interaction: requested.interaction === true,
    winScore: requested.winScore === 11 ? 11 : 7,
    laps: requested.laps === 3 ? 3 : 1,
    holes: [1, 3, 6].includes(requested.holes) ? requested.holes : 3,
    rotation: ["pick", "winner", "bracket"].includes(requested.rotation)
      ? requested.rotation
      : "winner",
    variant: ["co-op", "battle", "race"].includes(requested.variant)
      ? requested.variant
      : "co-op",
  };
}
