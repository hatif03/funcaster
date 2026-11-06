import { spawnSync } from "node:child_process";
const steps = [
  ["ci", "--include=dev"],
  ["ci", "--ignore-scripts", "--prefix", "integrations/storage"],
  ["ci", "--ignore-scripts", "--prefix", "integrations/ens"],
];
if (process.env.FUNCASTER_ROLE === "relay")
  steps.push(
    [
      "install",
      "--ignore-scripts",
      "--package-lock=false",
      "--prefix",
      "integrations/arc/pot-console",
    ],
    ["run", "build", "--prefix", "integrations/arc/pot-console"],
  );
for (const args of steps) {
  const result = spawnSync("npm", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
