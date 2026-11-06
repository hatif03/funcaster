import { paymentData, claimData } from "./signatures.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function rebuildPayment(
  prepared,
  { deployment, game, buyer, roomCode, code = "" },
) {
  const p = prepared.input;
  if (
    prepared.action !== "pay" ||
    !same(prepared.config?.contract, deployment?.address) ||
    prepared.config.chainId !== 5042002 ||
    p.versionId !== "0x" + game.id ||
    !same(p.payer, buyer) ||
    p.roomCode !== roomCode ||
    p.price !== game.price ||
    p.attribution !== (code === game.creatorCode) ||
    p.referred !== (code === game.referralCode) ||
    p.atVenue !== !!game.venue ||
    prepared.expiresAt < Date.now() ||
    prepared.expiresAt > Date.now() + 310000
  )
    throw Error("PAYMENT_DETAILS_CHANGED");
  return paymentData({ chainId: 5042002, contract: deployment.address }, p);
}
export function rebuildClaim(prepared, { deployment, recipient }) {
  if (
    prepared.action !== "claim" ||
    !same(prepared.config?.contract, deployment?.address) ||
    prepared.config.chainId !== 5042002 ||
    !same(prepared.input?.recipient, recipient) ||
    prepared.expiresAt < Date.now() ||
    prepared.expiresAt > Date.now() + 310000
  )
    throw Error("CLAIM_DETAILS_CHANGED");
  return claimData(
    { chainId: 5042002, contract: deployment.address },
    prepared.input,
  );
}
