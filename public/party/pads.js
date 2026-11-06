import { TOOLBAR } from "../../games/drawing/logic.js";

/** Games whose play still comes from the phone's attitude. */
export const GYRO_GAMES = new Set(["fruit-ninja", "swordplay"]);

/**
 * Finger position in the stick's own box, so a turned landscape page still
 * reports right as +x and down as +y. `origin`, `across` and `down` are the
 * viewport points of the box's top-left, top-right and bottom-left.
 */
function pointFromCorners(origin, across, down, clientX, clientY) {
  const vx = across.x - origin.x;
  const vy = across.y - origin.y;
  const ux = down.x - origin.x;
  const uy = down.y - origin.y;
  const px = clientX - origin.x;
  const py = clientY - origin.y;
  const det = vx * uy - vy * ux;
  if (!Number.isFinite(det) || Math.abs(det) < 0.001) return { x: 0.5, y: 0.5 };
  return { x: (px * uy - py * ux) / det, y: (vx * py - vy * px) / det };
}

export function axesFromCorners(
  origin,
  across,
  down,
  clientX,
  clientY,
  mode = "xy",
) {
  const point = pointFromCorners(origin, across, down, clientX, clientY);
  let x = (point.x - 0.5) * 2;
  let y = (point.y - 0.5) * 2;
  if (mode === "x") y = 0;
  else if (mode === "y") x = 0;
  if (mode === "xy") {
    const len = Math.hypot(x, y) || 1;
    if (len > 1) {
      x /= len;
      y /= len;
    }
  } else {
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
  }
  if (Math.abs(x) < 0.12) x = 0;
  if (Math.abs(y) < 0.12) y = 0;
  return { x, y };
}

/** Held direction names become a stick in -1..1. Up is negative, matching the games. */
export function axisTargets(holds) {
  const has = (name) => !!holds?.has?.(name);
  return {
    x: (has("right") ? 1 : 0) - (has("left") ? 1 : 0),
    y: (has("down") ? 1 : 0) - (has("up") ? 1 : 0),
  };
}

/** Toolbar cell → the party stick coordinate the game already maps onto the screen. */
export function toolAim(kind, colorIndex = 0) {
  const entry =
    kind === "color"
      ? TOOLBAR.filter((item) => item.kind === "color")[colorIndex]
      : TOOLBAR.find((item) => item.kind === kind);
  if (!entry) return { x: 0, y: 0 };
  const sx = entry.rect.x + entry.rect.w / 2;
  const sy = entry.rect.y + entry.rect.h / 2;
  return { x: (sx - 0.5) * 2, y: (sy - 0.5) * 2 };
}

/** Finger point inside the paper, kept clear of the on-screen toolbar. */
export function paperAim(nx, ny) {
  const sx = 0.08 + Math.min(1, Math.max(0, nx)) * 0.9;
  const sy = 0.02 + Math.min(1, Math.max(0, ny)) * 0.96;
  return { x: (sx - 0.5) * 2, y: (sy - 0.5) * 2 };
}

export function paperAimFromCorners(origin, across, down, clientX, clientY) {
  const point = pointFromCorners(origin, across, down, clientX, clientY);
  return paperAim(point.x, point.y);
}

const cell = (id, label, extra = {}) => ({ id, label, ...extra });

/**
 * Landscape pad for the game now on screen.
 * `setup` is Kart Rush driver select. `guessing` is a Drawing guesser.
 * `motion` is whether this phone is already streaming the gyroscope.
 */
export function padSpec(
  game,
  {
    setup = false,
    guessing = false,
    drawing = false,
    reveal = false,
    motion = true,
  } = {},
) {
  if (guessing && !drawing) return null;
  if (reveal) return null;
  if (game === "mario-kart" && setup)
    return {
      key: "mario-setup",
      columns: "1fr 1.4fr 1fr",
      rows: "1fr",
      cells: [
        cell("prev", "Previous", { tap: "left" }),
        cell("ready", "Ready", { tap: "confirm", primary: true }),
        cell("next", "Next", { tap: "right" }),
      ],
    };
  if (game === "mario-kart" || game === "kart" || game === "neon-drift")
    return {
      key: game === "mario-kart" ? "race-item" : "race",
      columns: "1fr 1fr 2fr",
      rows: "1fr 1fr",
      item: game === "mario-kart",
      cells: [
        cell("boost", "Boost", { hold: "boost", column: "1 / 3", row: "1" }),
        cell("gas", "Accelerate", {
          hold: "gas",
          column: "3",
          row: "1",
          primary: true,
        }),
        cell("left", "L", { hold: "left", column: "1", row: "2" }),
        cell("right", "R", { hold: "right", column: "2", row: "2" }),
        cell("brake", "Brake", { hold: "brake", column: "3", row: "2" }),
      ],
    };
  if (game === "alien-attack")
    return {
      key: "alien",
      columns: "1.5fr 1fr",
      rows: "1fr",
      cells: [
        cell("stick", "Move", { stick: "xy" }),
        cell("fire", "Fire", { tap: "primary", primary: true }),
      ],
    };
  if (game === "star-catch")
    return {
      key: "star",
      columns: "1fr 1fr",
      rows: "1fr",
      cells: [
        cell("left", "Left", { hold: "left" }),
        cell("right", "Right", { hold: "right" }),
      ],
    };
  if (game === "island-flyover")
    return {
      key: "fly",
      columns: "1fr 1fr",
      rows: "1fr",
      cells: [
        cell("bank", "Left / Right", { stick: "x" }),
        cell("pitch", "Up / Down", { stick: "y" }),
      ],
    };
  if (game === "golf")
    return {
      key: "golf",
      columns: "1fr 1.4fr",
      rows: "1fr 1fr",
      cells: [
        cell("left", "Aim left", { hold: "left", column: "1", row: "1" }),
        cell("right", "Aim right", { hold: "right", column: "1", row: "2" }),
        cell("swing", "Swing", {
          swing: true,
          column: "2",
          row: "1 / 3",
          primary: true,
        }),
      ],
    };
  if (game === "table-tennis")
    return {
      key: "tennis",
      columns: "1.5fr 1fr",
      rows: "1fr",
      cells: [
        cell("stick", "Move", { stick: "xy" }),
        cell("hit", "Hit", { tap: "primary", primary: true }),
      ],
    };
  if (game === "bubble-burst")
    return {
      key: "bubble",
      columns: "1.5fr 1fr",
      rows: "1fr",
      cells: [
        cell("stick", "Move", { stick: "xy" }),
        cell("burst", "Burst", { tap: "pulse", primary: true }),
      ],
    };
  if (game === "drawing") return { key: "draw", kind: "draw" };
  if (game === "shooting-range")
    return {
      key: "range",
      columns: "1.5fr 1fr",
      rows: "1fr",
      cells: [
        cell("stick", "Aim", { stick: "xy" }),
        cell("fire", "Fire", { tap: "primary", primary: true }),
      ],
    };
  if (game === "fruit-ninja")
    return {
      key: `slice-${motion ? "gyro" : "ask"}`,
      columns: "1fr",
      rows: motion ? "1fr" : "1fr auto",
      cells: [
        cell("aim", "Swing to slice", { quiet: true }),
        ...(motion ? [] : [cell("motion", "Allow motion", { tap: "motion" })]),
      ],
    };
  if (game === "swordplay")
    return {
      key: `sword-${motion ? "gyro" : "ask"}`,
      columns: "1.4fr 1fr",
      rows: motion ? "1fr" : "1fr auto",
      cells: [
        cell("aim", "Tilt the blade", { quiet: true, column: "1", row: "1" }),
        cell("strike", "Strike", {
          tap: "primary",
          column: "2",
          row: "1",
          primary: true,
        }),
        ...(motion
          ? []
          : [
              cell("motion", "Allow motion", {
                tap: "motion",
                column: "1 / 3",
                row: "2",
              }),
            ]),
      ],
    };
  return null;
}

function button(label, extra) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  Object.assign(node, extra);
  return node;
}

function place(node, item) {
  if (item.column) node.style.gridColumn = item.column;
  if (item.row) node.style.gridRow = item.row;
  if (item.primary) node.classList.add("primary");
  if (item.quiet) node.classList.add("quiet");
}

function bindPress(node, down, up) {
  let pointerId = null;
  const end = (event) => {
    if (pointerId === null) return;
    if (event.pointerId !== undefined && event.pointerId !== pointerId) return;
    const released = pointerId;
    pointerId = null;
    node.classList.remove("pressed");
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try {
      node.releasePointerCapture(released);
    } catch {}
    up(event);
  };
  node.addEventListener("pointerdown", (event) => {
    if (
      node.disabled ||
      node.classList.contains("locked") ||
      pointerId !== null
    )
      return;
    if (event.cancelable) event.preventDefault();
    pointerId = event.pointerId;
    node.classList.add("pressed");
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      /* A phone that rejects capture still owes us pointerup on the window. */
    }
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    down(event);
  });
  node.addEventListener("lostpointercapture", end);
  node.addEventListener("contextmenu", (event) => event.preventDefault());
  return () => end({ type: "pointercancel", pointerId });
}

/** Fill #game-pad and return a function that cancels all active gestures. */
export function mountPad(root, spec, handlers) {
  const releases = [];
  const press = (...args) => releases.push(bindPress(...args));
  const release = () => releases.forEach((cancel) => cancel());
  root.replaceChildren();
  root.classList.toggle("draw", spec.kind === "draw");
  if (spec.kind === "draw") {
    mountDraw(root, handlers, press);
    return release;
  }
  root.style.gridTemplateColumns = spec.columns;
  root.style.gridTemplateRows = spec.rows;
  for (const item of spec.cells) {
    if (item.stick) {
      root.append(mountStick(item, handlers, press));
      continue;
    }
    const node = item.quiet
      ? Object.assign(document.createElement("div"), {
          textContent: item.label,
        })
      : button(item.label);
    node.dataset.pad = item.id;
    place(node, item);
    if (item.hold) {
      node.dataset.hold = item.hold;
      press(
        node,
        (event) => handlers.onHold(item.hold, true, event.pointerId),
        (event) => handlers.onHold(item.hold, false, event.pointerId),
      );
    } else if (item.tap) {
      node.dataset.tap = item.tap;
      press(
        node,
        () => handlers.onTap(item.tap),
        () => {},
      );
    } else if (item.swing) {
      node.dataset.swing = "1";
      press(
        node,
        (event) => {
          handlers.onSwing(true, event);
          node._swingOff = (release) => {
            const box = node.getBoundingClientRect();
            const inside =
              release.type === "pointerup" &&
              release.clientX >= box.left &&
              release.clientX <= box.right &&
              release.clientY >= box.top &&
              release.clientY <= box.bottom;
            handlers.onSwing(false, release, inside);
          };
        },
        (event) => node._swingOff?.(event),
      );
    }
    root.append(node);
  }
  if (spec.item) {
    const item = button("Item");
    item.className = "item";
    item.dataset.tap = "item";
    press(
      item,
      () => handlers.onTap("item"),
      () => {},
    );
    root.append(item);
  }
  addPause(root, handlers, press);
  addStatus(root);
  return release;
}

function mountCorners(element) {
  const markers = ["", " across", " down"].map((suffix) => {
    const node = document.createElement("i");
    node.className = `stick-axis${suffix}`;
    element.append(node);
    return node;
  });
  return () =>
    markers.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.left, y: box.top };
    });
}

function mountStick(item, handlers, press) {
  const well = document.createElement("div");
  well.className = "stick";
  well.dataset.pad = item.id;
  well.dataset.axis = item.stick;
  well.setAttribute("role", "application");
  well.setAttribute("aria-label", item.label);
  place(well, item);
  const caption = document.createElement("b");
  caption.textContent = item.label;
  const knob = document.createElement("span");
  knob.className = "knob";
  const corners = mountCorners(well);
  well.append(caption, knob);
  let pointerId = null;
  const report = (vector) => {
    const partial = {};
    if (item.stick !== "y") partial.x = vector.x;
    if (item.stick !== "x") partial.y = vector.y;
    handlers.onStick(partial);
    const limit =
      item.stick === "xy" ? Math.min(well.offsetWidth, well.offsetHeight) : 0;
    const travelX =
      item.stick === "y"
        ? 0
        : Math.max(20, (limit || well.offsetWidth) / 2 - 46);
    const travelY =
      item.stick === "x"
        ? 0
        : Math.max(20, (limit || well.offsetHeight) / 2 - 46);
    knob.style.transform = `translate(${(partial.x || 0) * travelX}px, ${(partial.y || 0) * travelY}px)`;
  };
  const fromEvent = (event) => {
    report(
      axesFromCorners(...corners(), event.clientX, event.clientY, item.stick),
    );
  };
  press(
    well,
    (event) => {
      pointerId = event.pointerId;
      fromEvent(event);
    },
    () => {
      pointerId = null;
      report({ x: 0, y: 0 });
    },
  );
  well.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointerId) fromEvent(event);
  });
  return well;
}

function addPause(root, handlers, press) {
  const pause = button("");
  pause.className = "pause";
  pause.setAttribute("aria-label", "Pause");
  pause.dataset.tap = "pause";
  pause.append(mark(), mark());
  press(
    pause,
    () => handlers.onTap("pause"),
    () => {},
  );
  root.append(pause);
}

function mark() {
  const bar = document.createElement("i");
  return bar;
}

function mountDraw(root, handlers, press) {
  root.style.gridTemplateColumns = "1fr";
  root.style.gridTemplateRows = "auto 1fr";
  const tools = document.createElement("div");
  tools.className = "pad-tools";
  TOOLBAR.filter((item) => item.kind === "color")
    .slice(0, 6)
    .forEach((entry, index) => {
      const swatch = button("");
      swatch.className = "swatch";
      swatch.style.background = entry.value;
      swatch.setAttribute("aria-label", `Colour ${index + 1}`);
      press(
        swatch,
        () => handlers.onTool("color", index),
        () => {},
      );
      tools.append(swatch);
    });
  for (const [kind, label] of [
    ["eraser", "Erase"],
    ["undo", "Undo"],
  ]) {
    const node = button(label);
    press(
      node,
      () => handlers.onTool(kind),
      () => {},
    );
    tools.append(node);
  }
  const clear = button("Clear");
  let clearTimer = 0;
  press(
    clear,
    () => {
      clearTimer = setTimeout(() => handlers.onTool("clear"), 450);
    },
    () => clearTimeout(clearTimer),
  );
  tools.append(clear);
  const paper = document.createElement("div");
  paper.className = "paper";
  const corners = mountCorners(paper);
  const note = document.createElement("p");
  note.id = "pad-note";
  note.textContent = "Draw with a finger";
  paper.append(note);
  let drawingId = null;
  const point = (event) =>
    paperAimFromCorners(...corners(), event.clientX, event.clientY);
  press(
    paper,
    (event) => {
      drawingId = event.pointerId;
      handlers.onDraw(point(event), true, event.pointerId);
    },
    (event) => {
      drawingId = null;
      handlers.onDraw(null, false, event.pointerId);
    },
  );
  paper.addEventListener("pointermove", (event) => {
    if (event.pointerId !== drawingId) return;
    handlers.onDraw(point(event), true, event.pointerId);
  });
  root.append(tools, paper);
  addPause(root, handlers, press);
  addStatus(root);
}

function addStatus(root) {
  const note = document.createElement("p");
  note.id = "pad-status";
  note.className = "pad-status";
  note.hidden = true;
  root.append(note);
}
