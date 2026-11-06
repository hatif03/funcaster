import { keccak256, stringToHex } from "viem";
import { requireEns } from "./errors.mjs";

// Funcaster emits ASCII labels. Reject inputs outside that namespace instead of
// silently normalizing lookalikes into a different authority.
export function checkedName(value) {
  requireEns(typeof value === "string", "INVALID_NAME", "Expected an ENS name");
  const name = value.toLowerCase();
  requireEns(
    name.length <= 253 &&
      name
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
    "INVALID_NAME",
    "Expected ASCII ENS labels, without spaces or empty labels",
  );
  return name;
}

export function checkedParent(value) {
  const name = checkedName(value);
  requireEns(
    name.split(".").length === 2 && name.endsWith(".eth"),
    "INVALID_PARENT",
    "ENS_PARENT must be a second-level .eth name",
  );
  return name;
}

export const labelId = (label) => BigInt(keccak256(stringToHex(label)));
export function dnsName(value) {
  return `0x${checkedName(value)
    .split(".")
    .map(
      (label) =>
        label.length.toString(16).padStart(2, "0") +
        Buffer.from(label).toString("hex"),
    )
    .join("")}00`;
}
