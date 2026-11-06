import { detectInAppBrowser } from "./phone-page.js";
const finite = Number.isFinite;
const bounded = (value, max) =>
  finite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;

/** Calls both permission APIs immediately, in the original click activation. */
export function requestMotionPermissions(window) {
  const requests = [];
  for (const Event of [
    window.DeviceOrientationEvent,
    window.DeviceMotionEvent,
  ]) {
    if (typeof Event?.requestPermission !== "function") continue;
    try {
      requests.push(Promise.resolve(Event.requestPermission()));
    } catch (error) {
      requests.push(Promise.reject(error));
    }
  }
  return Promise.allSettled(requests).then((results) => ({
    denied:
      !window.isSecureContext ||
      results.some(
        (result) => result.status === "rejected" || result.value !== "granted",
      ),
  }));
}

export function deviceProfile({
  window,
  navigator,
  document,
  denied = false,
  samples = 0,
  gyro = false,
  elapsed = 1000,
  fresh = false,
}) {
  const ua = navigator.userAgent || "";
  const inApp = detectInAppBrowser(ua);
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const platform = ios
    ? "ios"
    : /Android/.test(ua)
      ? "android"
      : window.matchMedia?.("(pointer: fine)").matches
        ? "desktop"
        : "other";
  const motion =
    !denied && window.isSecureContext === true && samples > 5 && fresh;
  const tablet =
    /iPad|Tablet/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    platform,
    tier: inApp
      ? "C"
      : motion
        ? platform === "desktop" || tablet
          ? "D"
          : "A"
        : "B",
    gyro: !!gyro && motion,
    hz: bounded((samples * 1000) / Math.max(1, elapsed), 240),
    // Scripted iOS switch haptics are unverified; do not claim a capability we don't use.
    haptics:
      typeof navigator.vibrate === "function" && platform === "android"
        ? "vibrate"
        : "none",
    fullscreen: !!document.fullscreenElement,
    standalone:
      navigator.standalone === true ||
      !!window.matchMedia?.("(display-mode: standalone)").matches,
    touchMax: bounded(navigator.maxTouchPoints, 20),
    inApp,
    secure: window.isSecureContext === true,
  };
}

/** Event capabilities, not user-agent guesses. Empty/stale streams try the fallback at 1.5s. */
export async function probeDevice({
  window,
  navigator,
  document,
  denied = false,
  now = () => performance.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  startFallback = () => {},
}) {
  const began = now();
  let samples = 0,
    last = -Infinity,
    gyro = false,
    gravityZ = null,
    relativeAt = -Infinity;
  const sample = () => {
    samples++;
    last = now();
  };
  const orientation = (event) => {
    if (!finite(event.beta) || !finite(event.gamma)) return;
    if (event.type === "deviceorientation") relativeAt = now();
    else if (now() - relativeAt <= 250) return;
    sample();
  };
  const motion = (event) => {
    if (
      event.rotationRate &&
      [
        event.rotationRate.alpha,
        event.rotationRate.beta,
        event.rotationRate.gamma,
      ].every(finite)
    )
      gyro = true;
    if (gravityZ === null && finite(event.accelerationIncludingGravity?.z))
      gravityZ = event.accelerationIncludingGravity.z;
  };
  const quaternion = (q) => {
    if (
      Array.isArray(q) &&
      q.length === 4 &&
      q.every(finite) &&
      Math.abs(Math.hypot(...q) - 1) <= 0.05
    )
      sample();
  };
  window.addEventListener("deviceorientation", orientation);
  window.addEventListener("deviceorientationabsolute", orientation);
  window.addEventListener("devicemotion", motion);
  const fresh = () => samples > 5 && now() - last <= 250;
  try {
    await wait(1000);
    if (
      !fresh() &&
      !denied &&
      window.isSecureContext &&
      !detectInAppBrowser(navigator.userAgent)
    ) {
      await wait(500);
      if (!fresh()) startFallback(quaternion);
      await wait(300);
    }
    return {
      device: deviceProfile({
        window,
        navigator,
        document,
        denied,
        samples,
        gyro,
        elapsed: now() - began,
        fresh: fresh(),
      }),
      diagnostics: { gravityZ, samples },
    };
  } finally {
    window.removeEventListener("deviceorientation", orientation);
    window.removeEventListener("deviceorientationabsolute", orientation);
    window.removeEventListener("devicemotion", motion);
  }
}

export function sensorErrorMessage(error) {
  const name = error?.error?.name || error?.name;
  return (
    {
      SecurityError:
        "Motion is blocked here. Open the secure invite in Safari or Chrome.",
      NotAllowedError:
        "Motion permission was not allowed. Touch controls are ready.",
      NotReadableError:
        "Your motion sensor is unavailable. Touch controls are ready.",
    }[name] || "No usable motion samples arrived. Touch controls are ready."
  );
}

/** Share an in-flight wake request and release even if the tab hides before it resolves. */
export function createWakeKeeper(navigator) {
  let sentinel = null,
    pending = null,
    wanted = false;
  const releaseSentinel = (lock) => {
    try {
      void lock?.release()?.catch(() => {});
    } catch {}
  };
  return {
    keep() {
      wanted = true;
      if (sentinel && !sentinel.released) return Promise.resolve(sentinel);
      if (pending) return pending;
      let request;
      try {
        request = navigator.wakeLock?.request("screen");
      } catch {
        return Promise.resolve(null);
      }
      pending = (async () => {
        try {
          const lock = await request;
          if (!wanted) {
            releaseSentinel(lock);
            return null;
          }
          sentinel = lock || null;
          lock?.addEventListener(
            "release",
            () => {
              if (sentinel === lock) sentinel = null;
            },
            { once: true },
          );
          return sentinel;
        } catch {
          return null;
        } finally {
          pending = null;
        }
      })();
      return pending;
    },
    release() {
      wanted = false;
      releaseSentinel(sentinel);
      sentinel = null;
    },
  };
}

/**
 * Class that keeps the controller in `desired` when the OS will not.
 * `portrait` is the device's current orientation, not the layout we want.
 */
export function orientationFallback(desired, portrait) {
  if (desired === "landscape" && portrait) return "lock-landscape";
  if (desired === "portrait" && !portrait) return "lock-portrait";
  return "";
}

/**
 * Native lock where the browser allows it (Chrome, once fullscreen).
 * Everywhere else, including iOS Safari, a CSS rotation keeps the same posture.
 */
export function createOrientationControl(orientation, env = {}) {
  const root = env.root || globalThis.document?.documentElement;
  const portrait =
    env.portrait ||
    (() =>
      globalThis.matchMedia?.("(orientation: portrait)")?.matches ?? false);
  let desired = null;
  const paint = () => {
    if (!root?.classList) return;
    const name = orientationFallback(desired, !!portrait());
    root.classList.toggle("lock-landscape", name === "lock-landscape");
    root.classList.toggle("lock-portrait", name === "lock-portrait");
  };
  const unlock = () => {
    try {
      orientation?.unlock?.();
    } catch {}
  };
  const apply = (posture) => {
    if (posture == null) {
      unlock();
      paint();
      return;
    }
    let pending;
    try {
      pending = orientation?.lock?.(posture);
    } catch {
      paint();
      return;
    }
    if (!pending || typeof pending.then !== "function") {
      paint();
      return;
    }
    pending
      .then(() => {
        if (desired !== posture) apply(desired);
        else root?.classList?.remove("lock-landscape", "lock-portrait");
      })
      .catch(() => {
        if (desired === posture) paint();
      });
  };
  globalThis.matchMedia?.("(orientation: portrait)")?.addEventListener?.(
    "change",
    () => {
      if (desired) apply(desired);
    },
  );
  return {
    set(posture, force = false) {
      if (posture !== null && !["portrait", "landscape"].includes(posture))
        return;
      if (!force && desired === posture) return;
      desired = posture;
      apply(posture);
    },
    release() {
      desired = null;
      apply(null);
    },
  };
}

/** iPhone Safari has no page fullscreen. A home-screen app already has it. */
export function iphoneBrowser(ua, { touch = false, standalone = false } = {}) {
  if (standalone) return false;
  const text = String(ua || "");
  if (/iPhone|iPod/.test(text)) return true;
  return !!(touch && /Macintosh/.test(text));
}

/**
 * Safari's bars are still up when the visible height is shorter than the
 * screen edge it is measured against. Upright, that edge is the long side.
 * Sideways, it is the short side. `chrome` is the strip that stays.
 */
export function safariBarsOpen({
  viewportHeight = 0,
  offsetTop = 0,
  screenWidth = 0,
  screenHeight = 0,
  screenShort = 0,
  chrome = 20,
} = {}) {
  const width = screenWidth || screenShort;
  const height = screenHeight || screenShort;
  if (!viewportHeight || !width || !height) return false;
  const along =
    viewportHeight > Math.min(width, height)
      ? Math.max(width, height)
      : Math.min(width, height);
  return viewportHeight + offsetTop < along - chrome;
}

/**
 * Make the phone page tall enough to scroll Safari's bars away, then lock
 * that scroll once they are gone. A tap scrolls for the player; if Safari
 * ignores it, the page can still be slid.
 */
export function installSafariFill({ window, document }) {
  const nav = window.navigator || {};
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  if (
    !iphoneBrowser(nav.userAgent, {
      touch: (nav.maxTouchPoints || 0) > 1,
      standalone,
    })
  )
    return () => {};
  const root = document.documentElement;
  let scrolled = 0;
  const metrics = () => {
    const viewport = window.visualViewport;
    const screen = window.screen || {};
    return {
      viewportHeight: viewport?.height || window.innerHeight || 0,
      offsetTop: viewport?.offsetTop || 0,
      screenWidth: screen.width || 0,
      screenHeight: screen.height || 0,
    };
  };
  const measure = () => {
    const open = safariBarsOpen(metrics());
    root.classList.toggle("ios-bars", open);
    if (!open && scrolled) {
      scrolled = 0;
      window.scrollTo?.(0, 0);
    }
  };
  const kick = () => {
    if (!root.classList.contains("ios-bars")) return;
    const y = window.scrollY || 0;
    scrolled = y + 64;
    window.scrollTo?.(0, scrolled);
  };
  const listen = (target, type, fn) => {
    target?.addEventListener?.(type, fn);
    return () => target?.removeEventListener?.(type, fn);
  };
  const stop = [
    listen(window, "resize", measure),
    listen(window, "orientationchange", measure),
    listen(window, "scroll", measure),
    listen(window.visualViewport, "resize", measure),
    listen(window.visualViewport, "scroll", measure),
    listen(document, "touchstart", kick),
  ];
  measure();
  return () => {
    for (const fn of stop) fn();
    root.classList.remove("ios-bars");
  };
}
