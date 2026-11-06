export const BRAND = Object.freeze({
  name: "Funcaster",
  os: "Funcaster",
  mascot: "Funcaster",
  wordmark: "funcaster",
  tagline: "Scan. Tilt. Play.",
});
export const title = (page) => (page ? `${page} — ${BRAND.os}` : BRAND.os);
