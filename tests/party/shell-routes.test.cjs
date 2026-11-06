const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const express = require("express");
const { attachShellRoutes } = require("../../server/shell-routes.cjs");
const { blockPrivateAssets } = require("../../server/public-assets.cjs");

async function server(t, shell) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "chonks-shell-routes-"));
  const files = {
    "public/index.html": "classic-dashboard",
    "public/os/index.html": "chonks-os",
    "assets/os/wallpaper.svg": "public-subset",
    "assets/source/secret.txt": "source-secret",
    "assets/mario-kart/secret.txt": "legacy-secret",
    "games/mario-kart/item-art/secret.txt": "item-secret",
  };
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const app = express();
  app.use(blockPrivateAssets);
  attachShellRoutes(app, root, shell);
  app.use(express.static(path.join(root, "public")));
  app.use("/assets", express.static(path.join(root, "assets")));
  app.use("/games", express.static(path.join(root, "games")));
  const listener = http.createServer(app);
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => listener.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  return (url) =>
    new Promise((resolve, reject) => {
      http
        .get(
          { hostname: "127.0.0.1", port: listener.address().port, path: url },
          (response) => {
            let body = "";
            response
              .setEncoding("utf8")
              .on("data", (chunk) => {
                body += chunk;
              })
              .on("end", () =>
                resolve({
                  status: response.statusCode,
                  headers: response.headers,
                  body,
                }),
              );
          },
        )
        .on("error", reject);
    });
}

test("shell routes keep classic by default and apply only explicit os/classic overrides", async (t) => {
  for (const env of ["classic", "os", "invalid"]) {
    const get = await server(t, env);
    for (const [url, expected] of [
      ["/", env === "os" ? "chonks-os" : "classic-dashboard"],
      ["/?shell=os&demo=1", "chonks-os"],
      ["/?shell=classic", "classic-dashboard"],
      ["/?shell=invalid", env === "os" ? "chonks-os" : "classic-dashboard"],
      [
        "/?shell=os&shell=classic",
        env === "os" ? "chonks-os" : "classic-dashboard",
      ],
      ["/os", "chonks-os"],
      ["/os/", "chonks-os"],
      ["/classic-dashboard", "classic-dashboard"],
    ]) {
      const response = await get(url);
      assert.equal(response.status, 200, `${env}: ${url}`);
      assert.equal(response.body, expected, `${env}: ${url}`);
      assert.equal(response.headers["cache-control"], "no-cache");
    }
  }
});

test("supplied source assets stay private through encoded, case and traversal URL forms", async (t) => {
  const get = await server(t, "classic");
  for (const url of [
    "/assets/source/secret.txt",
    "/assets/source",
    "/ASSETS/SOURCE/secret.txt",
    "/assets/%73ource/secret.txt",
    "/assets%2fsource%2fsecret.txt",
    "/assets/%2e/source/secret.txt",
    "/assets/os/../source/secret.txt",
    "/assets/os/%2e%2e/source/secret.txt",
    "/assets%5csource%5csecret.txt",
    "/assets//source/secret.txt",
    "/assets/mario-kart/secret.txt",
    "/assets/%6dario-kart/secret.txt",
    "/games/mario-kart/item-art/secret.txt",
    "/games/mario-kart/%69tem-art/secret.txt",
    "/assets/%2573ource/secret.txt",
  ]) {
    const response = await get(url);
    assert.equal(response.status, 404, url);
    assert.ok(!response.body.includes("source-secret"), url);
  }
  const subset = await get("/assets/os/wallpaper.svg");
  assert.equal(subset.status, 200);
  assert.equal(subset.body, "public-subset");
});
