import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { pathToFileURL, fileURLToPath } from "node:url";
export async function signerBundle() {
  return (
    await build({
      entryPoints: [
        fileURLToPath(
          new URL(
            "../integrations/shared/phone-signer.src.mjs",
            import.meta.url,
          ),
        ),
      ],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      minify: true,
      legalComments: "none",
      write: false,
      logLevel: "silent",
    })
  ).outputFiles[0].contents;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const bytes = await signerBundle();
  const size = gzipSync(bytes).length;
  if (size >= 120000) throw Error("Phone signer exceeds 120 KB gzipped");
  const dir = new URL("../public/web3/", import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("phone-signer.js", dir), bytes);
  console.log(`Phone signer: ${size} bytes gzipped.`);
}
