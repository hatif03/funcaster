"use strict";
const path = require("node:path");

function attachShellRoutes(app, root, defaultShell = process.env.CHONKS_SHELL) {
  const shellFile = (shell) =>
    path.join(root, "public", shell === "os" ? "os/index.html" : "index.html");
  const send = (res, shell) =>
    res.set("Cache-Control", "no-cache").sendFile(shellFile(shell));
  app.get("/", (req, res) => {
    const requested = req.query.shell;
    const shell = ["os", "classic"].includes(requested)
      ? requested
      : defaultShell;
    send(res, shell);
  });
  app.get("/os", (_req, res) => send(res, "os"));
  app.get("/classic-dashboard", (_req, res) => send(res, "classic"));
}

module.exports = { attachShellRoutes };
