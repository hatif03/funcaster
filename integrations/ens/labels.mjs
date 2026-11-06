import { createHash } from "node:crypto";
import { requireEns } from "./errors.mjs";
import { sanitizeName } from "../../server/web3/names.cjs";

const adjectives = [
  "happy",
  "cosmic",
  "sunny",
  "quick",
  "tiny",
  "lucky",
  "jolly",
  "mellow",
];
const animals = [
  "cat",
  "otter",
  "panda",
  "fox",
  "koala",
  "tiger",
  "gecko",
  "robin",
];
const defaults = ["peeli", "magenta", "cyan", "marigold"];
export function partyLabel(code, attempt = 0) {
  requireEns(
    typeof code === "string" && /^[A-Z0-9]{4,8}$/.test(code),
    "INVALID_JOB",
    "Invalid party code",
  );
  const h = createHash("sha256").update(code).digest();
  return collisionLabel(
    `${adjectives[h[0] % adjectives.length]}-${animals[h[1] % animals.length]}-${code.slice(-2).toLowerCase()}`,
    attempt,
  );
}
export function seatLabel(nickname, slot, attempt = 0) {
  requireEns(
    Number.isInteger(slot) && slot >= 0 && slot < 4,
    "INVALID_JOB",
    "Invalid seat slot",
  );
  return collisionLabel(sanitizeName(nickname) || defaults[slot], attempt);
}
export function collisionLabel(base, attempt) {
  requireEns(
    Number.isInteger(attempt) && attempt >= 0 && attempt < 100,
    "COLLISION_LIMIT",
    "Name collision limit reached",
  );
  const suffix = attempt ? `-${attempt + 1}` : "";
  return base.slice(0, 20 - suffix.length).replace(/-+$/, "") + suffix;
}
