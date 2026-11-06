import { clamp } from "./orientation.js";

export const MOTION_PROFILES = {
  party: { key: "chonks.sensitivity", default: 1.25, min: 0.6, max: 2.4 },
  racing: { key: "chonks.racingSensitivity", default: 1, min: 0.7, max: 1.3 },
};

// Racing gets its own preference, so an old high aiming sensitivity cannot
// silently make the wheel twitchy. Storage may be unavailable on some phones.
export class MotionSettings {
  constructor(storage) {
    this.storage = storage;
    this.values = {};
    for (const [name, profile] of Object.entries(MOTION_PROFILES)) {
      let value;
      try {
        value = Number(storage?.getItem(profile.key));
      } catch {}
      this.values[name] =
        Number.isFinite(value) && value > 0
          ? clamp(value, profile.min, profile.max)
          : profile.default;
    }
  }
  get(name) {
    return this.values[name];
  }
  set(name, value) {
    const profile = MOTION_PROFILES[name];
    if (!Number.isFinite(value)) return this.get(name);
    this.values[name] = clamp(value, profile.min, profile.max);
    try {
      this.storage?.setItem(profile.key, String(this.values[name]));
    } catch {}
    return this.get(name);
  }
}
