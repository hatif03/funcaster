// Offline only. No overwrite, no funding, no secret in stdout or Git.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
import { mkdir, open, access, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function initializeLocal(root = process.cwd()) {
  const workerRoles = [
    "ENS_REGISTRAR_KEY",
    "ARC_RELAYER_KEY",
    "ARC_ORACLE_KEY",
    "ARKIV_CONSOLE_KEY",
    "MARKET_OPERATOR_KEY",
    "MARKET_REPORTER_A_KEY",
    "MARKET_PERMIT_KEY",
    "CHECKPOINT_SIGNER_KEY",
    "ARC_RELAYER_KEY_2",
  ];
  const isolatedRoles = {
    ".env.verifier": ["MARKET_VERIFIER_KEY"],
    ".local/web3-keys/spares.env": [
      "ENS_REGISTRAR_SPARE_KEY",
      "ARKIV_CONSOLE_SECOND_KEY",
      "ARKIV_CONSOLE_SPARE_KEY",
      "DEVELOPER_KEY",
    ],
  };
  const targets = [
    ".env.relay",
    ".env.worker",
    ".env.gateway",
    ...Object.keys(isolatedRoles),
    ".local/web3-keys/addresses.json",
  ];
  for (const name of targets) {
    try {
      await access(path.join(root, name));
      throw new Error(`Refusing to overwrite ${name}; keep existing keys.`);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  const privateDir = path.join(root, ".local/web3-keys");
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  await chmod(privateDir, 0o700);
  const publicRows = [];
  function keys(roles, file) {
    return roles
      .map((role) => {
        const key = generatePrivateKey();
        publicRows.push({
          role,
          address: privateKeyToAccount(key).address,
          file,
        });
        return `${role}=${key}`;
      })
      .join("\n");
  }
  const publicDefaults =
    "PARTNERS=mock\nWEB3_DATA_DIR=.local/web3\nPLAY_MONEY=1\nMARKETS=off\nSTREAMERS=off\nFEATURE_CREATOR=off\n";
  const files = {
    ".env.relay": `# Public config only. No real networks enabled. PUBLIC_ORIGIN and ENS_PARENT pending.\n${publicDefaults}`,
    ".env.worker": `# TESTNET KEYS ONLY. Back up privately. Never source this into the relay.\n${publicDefaults}WEB3_KILL=0\n${keys(workerRoles, ".env.worker")}\n`,
    ".env.gateway": `# Separate gateway only. Platform credentials pending. No chain keys.\nPARTNERS=mock\nSTREAMERS=off\nGATEWAY_TOKEN_KEY=${randomBytes(32).toString("hex")}\n`,
  };
  for (const [file, roles] of Object.entries(isolatedRoles))
    files[file] =
      `# Isolated TESTNET roles; never load into relay or main worker.\n${keys(roles, file)}\n${file === ".env.verifier" ? `MARKET_VERIFIER_TOKEN=${randomBytes(32).toString("base64url")}\n` : ""}`;
  files[".local/web3-keys/addresses.json"] =
    JSON.stringify(
      {
        purpose: "testnet only; unfunded; no verified deployments",
        roles: publicRows,
      },
      null,
      2,
    ) + "\n";
  const written = [];
  try {
    for (const [file, contents] of Object.entries(files)) {
      const dest = path.join(root, file);
      const h = await open(dest, "wx", 0o600);
      written.push(dest);
      try {
        await h.writeFile(contents);
        await h.sync();
      } finally {
        await h.close();
      }
    }
  } catch (e) {
    await Promise.all(written.map((file) => unlink(file)));
    throw e;
  }
  return {
    count: publicRows.length,
    inventory: ".local/web3-keys/addresses.json",
    files: targets,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const r = await initializeLocal();
    console.log(
      `Prepared ${r.count} fresh testnet role keys. Secrets are in separate 0600 ignored files. Public addresses: ${r.inventory}. No funding or transactions performed.`,
    );
  } catch (e) {
    console.error(
      e.code
        ? `Local setup failed (${e.code}); no credentials logged.`
        : e.message,
    );
    process.exitCode = 1;
  }
}
