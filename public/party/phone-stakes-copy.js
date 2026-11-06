import { WEB3_STRINGS } from "../os/strings.js";
// Loaded only with the phone stakes UI; preserves the initial desktop byte budget.
export const PHONE_STAKES_STRINGS = Object.freeze({
  ...WEB3_STRINGS,
  mock: "MOCK — local simulation",
  putIn: "Put in your stake",
  result: "Your result",
  accept: "Put in my stake",
  decline: "Not now",
  dispute: "Dispute",
  close: "Close",
  trust:
    "All agree to pay out; a referee can step in after a minute. Disputes and unfinished games refund at the deadline.",
  terms: (game, amount, asset, n) =>
    `${game} · ${n} players. ${amount} play-${asset} each. You may get nothing back.`,
  placing: (scores) =>
    scores
      .map((s) => `${s.rank}. ${s.name || `Player ${s.slot + 1}`}`)
      .join(" · "),
  finished: "Round complete",
  finishedHelp: "Keep this browser to use your play money next time.",
  settleHelp:
    "Check the result. We agree automatically after five seconds while this screen is visible. Tap Dispute before agreeing. Once signed, an agreement cannot be withdrawn.",
  agreeing: (n) => `Agreeing in ${n}…`,
  checking: "Checking the result…",
  agreed: "Agreed. Waiting for payout.",
  disputed:
    "Disputed. We will request a refund when the referee proposes the result.",
  declined: "Stake declined. The host can continue without stakes.",
  funding: "Waiting for the other players to fund.",
  waiting: "Waiting for the service. Your game can continue without stakes.",
  expired: "This request expired. Wait for an updated card.",
  refunded: "Refunded. Each funded player gets their stake back.",
  claiming: "Settled. Payouts are being collected.",
  paid: (amount, asset) =>
    `Paid out: ${(Number(amount) / 1e6).toFixed(2)} play-${asset}.`,
});
