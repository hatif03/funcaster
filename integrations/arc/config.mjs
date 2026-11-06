import {
  getAddress,
  parseEther,
  parseGwei,
  parseUnits,
  zeroAddress,
} from "viem";
import { requireArc, same, hex32 } from "./jobs.mjs";

const required = (c, k) => {
  requireArc(
    c[k] !== "" && c[k] !== undefined,
    "INVALID_CONFIG",
    `${k} is required for Arc worker activation`,
  );
  return c[k];
};
const units = (c, k, decimals = 6) => {
  const value = String(required(c, k));
  requireArc(
    new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(value),
    "INVALID_CONFIG",
    `${k} exceeds asset precision`,
  );
  const n = parseUnits(value, decimals);
  requireArc(n > 0n, "INVALID_CONFIG", `${k} must be positive`);
  return n;
};
export function arcDeployment(c) {
  requireArc(
    c.ARC_CHAIN_ID === 5042002 && c.PLAY_MONEY === "1",
    "INVALID_CONFIG",
    "Arc worker is testnet and play-money only",
  );
  const contract = getAddress(required(c, "ARC_POT_ADDRESS")),
    runtimeCodeHash = required(c, "ARC_POT_CODE_HASH"),
    blockNumber = required(c, "ARC_POT_DEPLOY_BLOCK");
  requireArc(
    contract !== zeroAddress &&
      hex32(runtimeCodeHash) &&
      Number.isSafeInteger(blockNumber) &&
      blockNumber >= 0,
    "INVALID_CONFIG",
    "Verified deployment code and block required",
  );
  // Deployment proof covers the contract's full immutable asset allowlist;
  // the runtime can expose fewer currencies without funding their bankrolls.
  const assets = (
    c.ARC_POT_ASSETS?.length ? c.ARC_POT_ASSETS : c.WEB3_ASSETS
  ).map((symbol) => ({
    symbol: symbol.toUpperCase(),
    address: getAddress(required(c, `ARC_${symbol.toUpperCase()}`)),
  }));
  requireArc(
    assets.length &&
      c.WEB3_ASSETS.every((symbol) =>
        assets.some((asset) => asset.symbol.toLowerCase() === symbol),
      ) &&
      assets.every((a) => a.address !== zeroAddress) &&
      new Set(assets.map((a) => a.address)).size === assets.length,
    "INVALID_CONFIG",
    "Unique allowed assets required",
  );
  for (const key of ["ARC_RELAYER_ADDRESS", "ARC_ORACLE_ADDRESS"])
    requireArc(
      getAddress(required(c, key)) !== zeroAddress,
      "INVALID_CONFIG",
      "Nonzero worker addresses required",
    );
  requireArc(
    !same(c.ARC_RELAYER_ADDRESS, c.ARC_ORACLE_ADDRESS),
    "INVALID_CONFIG",
    "Arc relayer and oracle must be separate keys",
  );
  return {
    chainId: c.ARC_CHAIN_ID,
    contract,
    runtimeCodeHash,
    blockNumber,
    assets,
    explorer: c.ARC_EXPLORER_URL,
  };
}
export function arcLimits(c) {
  const maxTransactions = required(c, "ARC_MAX_TRANSACTIONS"),
    maxPerRoom = required(c, "WEB3_MAX_TX_PER_ROOM"),
    maxPerHour = required(c, "WEB3_MAX_TX_PER_HOUR");
  requireArc(
    [maxTransactions, maxPerRoom, maxPerHour].every(
      (v) => Number.isSafeInteger(v) && v > 0,
    ),
    "INVALID_CONFIG",
    "Positive Arc transaction caps required",
  );
  const maxFeePerGasWei = parseGwei(String(required(c, "ARC_MAX_FEE_GWEI"))),
    floor = units(c, "ARC_MIN_RELAYER_BALANCE");
  requireArc(
    maxFeePerGasWei >= 20_000_000_000n && floor >= 50000n,
    "INVALID_CONFIG",
    "Arc fee or retained balance floor too low",
  );
  const common = {
    maxTransactions,
    maxPerRoom,
    maxPerHour,
    maxFeePerGasWei,
    priorityFeeWei: 0n,
    minimumFeePerGasWei: 20_000_000_000n,
    nativeBalanceFloorWei: floor * 10n ** 12n,
  };
  const roles = Object.fromEntries(
    ["relayer", "oracle"].map((role) => [
      role,
      {
        ...common,
        budgetWei: parseEther(
          String(required(c, `ARC_${role.toUpperCase()}_MAX_GAS_USDC`)),
        ),
      },
    ]),
  );
  requireArc(
    Object.values(roles).every((r) => r.budgetWei > 0n),
    "INVALID_CONFIG",
    "Positive per-role gas budgets required",
  );
  const drip = Object.fromEntries(
    c.WEB3_ASSETS.map((asset) => [
      asset,
      {
        perDevice: units(c, "ARC_DRIP_MAX_PER_DEVICE"),
        perIpHour: units(c, "ARC_DRIP_MAX_PER_IP_HOUR"),
        perRoom: units(c, "ARC_DRIP_MAX_PER_ROOM"),
        total: units(c, `ARC_DRIP_MAX_TOTAL_${asset.toUpperCase()}`),
        bankroll: units(c, `ARC_DRIP_BANKROLL_${asset.toUpperCase()}`),
        floor: 50000n,
      },
    ]),
  );
  requireArc(
    Object.values(drip).every(
      (d) =>
        d.bankroll >= 50000n &&
        d.perDevice >= d.bankroll &&
        d.total >= d.bankroll,
    ),
    "INVALID_CONFIG",
    "Drip limits must cover one bankroll and retained floor",
  );
  return { roles, drip };
}
