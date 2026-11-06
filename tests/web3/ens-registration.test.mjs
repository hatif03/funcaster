import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateInput,
  rolesFromPinnedSource,
} from "../../scripts/spikes/ens-register-parent.mjs";
const input = JSON.parse(
  await readFile(
    new URL(
      "../../docs/web3/spikes/ens-registration-input.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("ENS operator registration refuses mainnet, unapproved names, pointer changes and unsafe caps", () => {
  validateInput(input);
  for (const change of [
    { chainId: 1 },
    { chainId: 5042002 },
    { label: "other" },
    { durationSeconds: 315360000 },
    { resolver: input.owner },
    { subregistry: input.owner },
    { maxMockTokenUnits: "100000001" },
    { maxMockTokenUnits: "0" },
    { maxGasCostWei: "10000000000000001" },
    { maxGasCostWei: "-1" },
  ])
    assert.throws(() => validateInput({ ...input, ...change }));
});
test("registration permissions are derived from selected pinned source constants, not every registry role", () => {
  const source = `uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_SET_RESOLVER_ADMIN = ROLE_SET_RESOLVER << 128;
    uint256 internal constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;`;
  const registrar =
    "uint256 constant REGISTRATION_ROLE_BITMAP = RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN | RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN;";
  const value = rolesFromPinnedSource(source, registrar);
  assert.equal(value.registration, (1n << 24n) | (1n << 152n) | (1n << 156n));
  assert.equal(value.registration & 1n, 0n);
  assert.throws(() =>
    rolesFromPinnedSource(
      source,
      "uint256 constant REGISTRATION_ROLE_BITMAP = RegistryRolesLib.ROLE_UNKNOWN;",
    ),
  );
});
