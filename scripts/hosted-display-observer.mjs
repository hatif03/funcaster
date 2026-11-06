import { io } from "socket.io-client";

// This connection has display authority only. A transport reconnect must renew
// that membership; it must never restore a host or join a phone on its behalf.
export function createHostedDisplayObserver({
  base,
  identity,
  buildId,
  now = Date.now,
  staleMs = 15000,
  recoveryMs = 180000,
  reconnectDelay = 1000,
}) {
  const socket = io(base + "/party", {
    transports: ["websocket"],
    forceNew: true,
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: reconnectDelay,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
  let state,
    authenticated = false,
    lastStateAt = now(),
    recoveryAt = now(),
    resyncing = false,
    closed = false,
    failure;
  function unavailable() {
    state = undefined;
    authenticated = false;
    recoveryAt ??= now();
  }
  function fail(error) {
    failure = error;
    unavailable();
    socket.disconnect();
  }
  socket.on("disconnect", (reason) => {
    unavailable();
    if (!closed && reason === "io server disconnect")
      fail(
        Error(
          "Read-only display was closed by the server; keep the saved table and profiles",
        ),
      );
  });
  socket.on("connect", () => {
    unavailable();
    resyncing = false;
    const connection = socket.id;
    socket
      .timeout(20000)
      .emit(
        "display",
        { code: identity.code, token: identity.displayToken, buildId },
        (error, reply) => {
          if (closed || connection !== socket.id || !socket.connected) return;
          if (error) {
            socket.io.engine.close();
            return;
          }
          if (!reply?.ok) {
            fail(
              Object.assign(
                Error(
                  "Saved table display is unavailable; no replacement table or fresh phone identity was created",
                ),
                {
                  expiredTable: reply?.error === "Display invite expired.",
                },
              ),
            );
            return;
          }
          authenticated = true;
          if (state) recoveryAt = null;
        },
      );
  });
  socket.on("state", (value) => {
    state = value;
    lastStateAt = now();
    if (authenticated) recoveryAt = null;
  });
  // Socket.IO retries connect_error through its manager. Never expose the last
  // authenticated snapshot while that read-only connection is unavailable.
  socket.on("connect_error", unavailable);
  function getState() {
    return socket.connected && authenticated && now() - lastStateAt < staleMs
      ? state
      : undefined;
  }
  function assertHealthy() {
    if (failure) throw failure;
    if (closed) throw Error("Read-only display is closed");
    if (getState()) return;
    recoveryAt ??= lastStateAt + staleMs;
    if (now() - recoveryAt >= recoveryMs) {
      fail(
        Error(
          "Read-only display could not reconnect within three minutes; keep the existing table, profiles and journal",
        ),
      );
      throw failure;
    }
    if (socket.connected && now() - lastStateAt >= staleMs && !resyncing) {
      resyncing = true;
      unavailable();
      socket.io.engine.close();
    }
  }
  socket.connect();
  return {
    socket,
    getState,
    assertHealthy,
    async ready() {
      while (!getState()) {
        assertHealthy();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    close() {
      closed = true;
      unavailable();
      socket.disconnect();
    },
  };
}
