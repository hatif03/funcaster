// This module is imported only after a state with web3 enabled. No motion hooks.
export function createPhoneIdentity(socket, getSeat) {
  let pending = null,
    generation = 0;
  socket.on("disconnect", () => {
    pending = null;
    generation++;
  });
  return {
    async challenge(challenge) {
      pending = challenge;
      const attempt = ++generation,
        seat = getSeat();
      if (!seat || seat.queued) return;
      try {
        const signer = await import("./phone-signer.js");
        if (attempt !== generation || !socket.connected) return;
        const response = await signer.signBind(challenge, seat);
        const latest = getSeat();
        if (
          attempt !== generation ||
          !socket.connected ||
          !latest ||
          latest.token !== seat.token ||
          latest.room !== seat.room ||
          pending !== challenge
        )
          return;
        socket.emit("web3.bind", response, () => {});
      } catch {
        /* Identity is optional: play continues as a guest. */
      }
    },
  };
}
