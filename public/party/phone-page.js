/** UA checks are coaching only; PH4 probes the actual sensor capabilities. */
export function detectInAppBrowser(userAgent = "") {
  return (
    /Instagram|FBAN|FBAV|Line\/|WhatsApp|Telegram|TikTok|Snapchat|Twitter|MicroMessenger|Messenger|; wv\)/i.exec(
      userAgent,
    )?.[0] || null
  );
}

/** Keep feedback channels independent: disabling vibration cannot silence visuals or audio. */
export function phoneFeedback(
  { visual, haptics, vibrate, userActivation, sound, playSound },
  pattern,
) {
  for (const effect of [
    visual,
    haptics &&
      userActivation?.hasBeenActive !== false &&
      vibrate &&
      (() => vibrate(pattern)),
    sound && playSound,
  ]) {
    try {
      if (effect) effect();
    } catch {
      /* A missing device capability must not suppress the others. */
    }
  }
}

/** Lock the document while retaining deliberate scrolling in forms and sheets. */
export function installPhonePageGuards({
  window,
  document,
  openPartyMenu,
  returnUrl,
}) {
  const contextmenu = (event) => event.preventDefault();
  // iOS pinch zoom is a gesture, not a touch-action. A second tap inside the
  // pad is a button, not a zoom. Inputs and sheets still take the second tap.
  let lastTap = 0;
  const editable = (target) =>
    !!target?.closest?.("input, textarea, select, [contenteditable='true'], [data-scroll]");
  const pinch = (event) => {
    if (event.touches?.length > 1 || event.type.startsWith("gesture"))
      event.preventDefault();
  };
  const doubleTap = (event) => {
    if (editable(event.target)) {
      lastTap = 0;
      return;
    }
    const now = Date.now();
    if (lastTap && now - lastTap < 350) event.preventDefault();
    lastTap = now;
  };
  const touchmove = (event) => {
    const target = event.target;
    // The game pad owns its gesture. Cancelling touchmove here makes phones
    // drop the press before a hold can reach the game.
    if (target?.closest?.("#game-pad")) return;
    // While Safari's bars are showing, a one-finger slide has to reach the
    // document or the bars never leave.
    if (document.documentElement?.classList?.contains("ios-bars")) {
      const control = target?.closest?.(
        "button, .pad, #motion-pad, #gas, #brake, #boost, #touch-steer",
      );
      if (!control) return;
    }
    const control = target?.closest?.(
      ".pad, #motion-pad, #gas, #brake, #boost, #touch-steer",
    );
    if (control || !target?.closest?.("[data-scroll]")) event.preventDefault();
  };
  const retain = (restoreUrl = false) =>
    window.history.pushState(
      { ...window.history.state, chonksPhoneGuard: true },
      "",
      restoreUrl ? returnUrl?.() : undefined,
    );
  const back = () => {
    retain(true);
    openPartyMenu();
  };
  // Reuse the guard after a reload rather than growing the history stack.
  if (!window.history.state?.chonksPhoneGuard) retain();
  document.addEventListener("contextmenu", contextmenu);
  document.addEventListener("touchmove", touchmove, { passive: false });
  document.addEventListener("touchstart", pinch, { passive: false });
  document.addEventListener("touchend", doubleTap, { passive: false });
  document.addEventListener("gesturestart", pinch, { passive: false });
  document.addEventListener("gesturechange", pinch, { passive: false });
  window.addEventListener("popstate", back);
  return () => {
    document.removeEventListener("contextmenu", contextmenu);
    document.removeEventListener("touchmove", touchmove);
    document.removeEventListener("touchstart", pinch);
    document.removeEventListener("touchend", doubleTap);
    document.removeEventListener("gesturestart", pinch);
    document.removeEventListener("gesturechange", pinch);
    window.removeEventListener("popstate", back);
  };
}
