"use strict";
// Deterministic local fixtures. Never emit transaction hashes, explorer links or
// verified badges for a mock receipt.
exports.createMockProviders = () => ({
  naming: {
    party: (room) => ({
      status: "ready",
      name: `MOCK-${room.code.toLowerCase()}`,
      expiresAt: null,
      explorer: null,
    }),
  },
  pot: {
    initial: () => ({
      rung: 0,
      status: "off",
      asset: "USDC",
      amount: "0",
      rule: "winner",
      potId: null,
      funded: [false, false, false, false],
      acceptedBy: [false, false, false, false],
      fundDeadline: null,
      oracle: "relay",
      tx: { create: null, lock: null, settle: null, refund: null },
      explorer: null,
      playMoney: true,
    }),
  },
  records: {
    finish: () => ({
      arc: null,
      arkiv: null,
      ens: null,
      state: "local",
      mock: true,
    }),
  },
});
