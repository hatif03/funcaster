/** Only phone identities survive tabs. Room owner/display credentials stay tab-scoped. */
export function deviceStore(session, local, now = Date.now) {
  const memory = new Map();
  const player = (key) => key.startsWith("chonks.player.");
  return {
    remember(key, value) {
      if (value == null) memory.delete(key);
      else
        memory.set(key, {
          value,
          expires: player(key) ? now() + 4 * 3600000 : Infinity,
        });
      try {
        const storage = player(key) ? local : session;
        if (value == null) {
          storage?.removeItem(key);
          session?.removeItem(key);
          return;
        }
        storage?.setItem(
          key,
          JSON.stringify(player(key) ? memory.get(key) : value),
        );
      } catch {
        /* Private browsing can disable storage. */
      }
    },
    recalled(key) {
      try {
        if (player(key)) {
          const record = JSON.parse(local?.getItem(key) || "null");
          if (record?.expires > now()) return record.value;
          if (record) {
            local?.removeItem(key);
            memory.delete(key);
          }
          const old = JSON.parse(session?.getItem(key) || "null");
          if (old) {
            this.remember(key, old);
            session.removeItem(key);
            return old;
          }
        } else {
          const raw = session?.getItem(key);
          if (raw != null) return JSON.parse(raw);
        }
      } catch {}
      const record = memory.get(key);
      if (record?.expires > now()) return record.value;
      memory.delete(key);
      return null;
    },
  };
}
