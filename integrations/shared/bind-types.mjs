export const BIND_TYPES = {
  Bind: [
    { name: "room", type: "string" },
    { name: "slot", type: "uint8" },
    { name: "nonce", type: "bytes32" },
    { name: "expiresAt", type: "uint64" },
  ],
};
export function bindData(challenge, { room, slot }) {
  return {
    domain: challenge.domain,
    types: BIND_TYPES,
    primaryType: "Bind",
    message: {
      room,
      slot,
      nonce: challenge.nonce,
      expiresAt: BigInt(challenge.expiresAt),
    },
  };
}
