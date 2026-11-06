/** Original trackside identities drawn with canvas; no external assets. */
export const STADIUM_BRANDS = [
  "COMET WORKS",
  "ORBIT ENERGY",
  "NOVA POWER",
  "CHONKS",
  "PIP'S PITSTOP",
  "AURORA CIRCUIT",
  "CLOUD CLUB",
  "CHONKS CUP",
];
const cache = new Map();
export function stadiumBrand(name, canvasTexture) {
  if (cache.has(name)) return cache.get(name);
  const index = Math.max(0, STADIUM_BRANDS.indexOf(name));
  const texture = canvasTexture(1024, 256, (c, w, h) => {
    c.fillStyle = ["#7357b9", "#e7b565", "#31978d", "#f6f2e5"][index % 4];
    c.fillRect(0, 0, w, h);
    c.fillStyle = index % 4 === 3 ? "#7357b9" : "#fff6db";
    c.beginPath();
    c.arc(128, 128, 72, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = index % 4 === 3 ? "#f6f2e5" : "#7357b9";
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(94, 128);
    c.lineTo(119, 152);
    c.lineTo(168, 101);
    c.stroke();
    c.font = "900 75px system-ui,sans-serif";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(name, 235, 110, 750);
    c.font = "500 24px system-ui,sans-serif";
    c.fillText("A LITTLE MOTION. A LOT OF FUN.", 240, 181, 730);
  });
  cache.set(name, texture);
  return texture;
}
