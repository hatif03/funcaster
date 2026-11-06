// Owner-operated hosted smoke acceptance. Joining real phones triggers bounded
// worker ENS/Arc transactions; require an explicit public-testnet confirmation.
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createHostedDisplayObserver } from "./hosted-display-observer.mjs";
import {
  assertPrepaymentRecovery,
  confirmPrepaymentOperations,
} from "./prepayment-table-recovery.mjs";

// A deploy can report live before its public route has converged. Only GETs
// retry here; joins, signatures, payment requests and saved identities do not.
export async function readHostedJson(
  base,
  route,
  {
    fetcher = fetch,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    headers,
    allowMissing = false,
  } = {},
) {
  const url = new URL(route, base);
  if (url.origin !== new URL(base).origin || url.username || url.password)
    throw Error("Invalid hosted read origin");
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetcher(url.href, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        ...(headers ? { headers } : {}),
      });
    } catch {
      if (attempt === 4)
        throw Error(
          `Hosted read unavailable: ${url.pathname} (network timeout or connection failure)`,
        );
    }
    if (allowMissing && response?.status === 404) return null;
    if (response?.ok) {
      try {
        return await response.json();
      } catch {
        throw Error(
          `Hosted read unavailable: ${url.pathname} (invalid JSON response)`,
        );
      }
    }
    if (
      response &&
      (attempt === 4 ||
        !(
          response.status === 429 ||
          (response.status >= 500 && response.status <= 599)
        ))
    )
      throw Error(
        `Hosted read unavailable: ${url.pathname} (HTTP ${response.status})`,
      );
    await wait(Math.min(2000 * 2 ** attempt, 10000));
  }
}

export function acceptanceOptions(args) {
  const recoverExpiredTable = args.at(-1) === "--recover-expired-table";
  const recoverPrepaymentTable = args.at(-1) === "--recover-prepayment-table";
  if (recoverExpiredTable || recoverPrepaymentTable) args = args.slice(0, -1);
  const mock = args[0] === "--mock";
  if (mock && (recoverExpiredTable || recoverPrepaymentTable))
    throw Error(
      "Expired-table recovery requires the explicit owner apply command",
    );
  const prefix = mock
    ? ["--mock", "--url"]
    : ["--apply", "--confirm-funcaster-testnet", "--url"];
  if (
    args.length !== prefix.length + 1 ||
    !prefix.every((part, i) => args[i] === part)
  )
    throw Error(
      "Use --apply --confirm-funcaster-testnet --url HTTPS_ORIGIN, or --mock --url LOOPBACK_ORIGIN",
    );
  const url = new URL(args.at(-1));
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (mock
      ? url.protocol !== "http:" || url.hostname !== "127.0.0.1"
      : url.protocol !== "https:" ||
        ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw Error(
      "Expected an origin without credentials or paths; mock must use loopback HTTP, owner apply must use public HTTPS",
    );
  return {
    mock,
    base: url.origin,
    ...(recoverExpiredTable ? { recoverExpiredTable: true } : {}),
    ...(recoverPrepaymentTable ? { recoverPrepaymentTable: true } : {}),
  };
}

const recoveryFiles = (directory, prepayment = false) => ({
  archive: path.join(
    directory,
    prepayment
      ? "session.prepayment.original.json"
      : "session.expired.original.json",
  ),
  marker: path.join(
    directory,
    prepayment
      ? "prepayment-table-recovery.json"
      : "expired-table-recovery.json",
  ),
});
const optionalJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
const privateJson = async (file, value) => {
  await writeFile(file + ".tmp", JSON.stringify(value), { mode: 0o600 });
  await rename(file + ".tmp", file);
};
export function assertRecoverableSession(journal) {
  const allowed = new Set([
    "version",
    "base",
    "mock",
    "checks",
    "started",
    "buildId",
    "host",
    "addresses",
  ]);
  const allowedChecks = new Set([
    "Two phone controllers joined; party and both seat ENS names are ready",
    "Both phones received confirmed Arc test-USDC starting play money",
  ]);
  if (
    !journal?.host?.code ||
    !journal.host.token ||
    !journal.host.displayToken ||
    journal.started !== false ||
    Object.keys(journal).some((key) => !allowed.has(key)) ||
    !Array.isArray(journal.checks) ||
    journal.checks.some((check) => !allowedChecks.has(check))
  )
    throw Error(
      "Expired-table recovery is only allowed before gameplay or any extension/financial step; preserve this session for inspection",
    );
}
export async function confirmTableMissing(
  base,
  host,
  { fetcher = fetch } = {},
) {
  if (!/^[A-Z2-9]{6}$/.test(host?.code || ""))
    throw Error("Invalid saved table identity");
  const response = await fetcher(`${base}/api/party/pairing/${host.code}`, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (
    response.status !== 404 ||
    (await response.json()).error !== "Party not found"
  )
    throw Error(
      "Saved table disappearance is not confirmed; no replacement was authorized",
    );
}
export async function reserveExpiredRecovery(
  directory,
  journal,
  addresses,
  prepayment = false,
) {
  if (prepayment) assertPrepaymentRecovery(journal);
  else assertRecoverableSession(journal);
  if (
    !Array.isArray(addresses) ||
    addresses.length !== 2 ||
    addresses.some((a) => !/^0x[\da-f]{40}$/i.test(a)) ||
    new Set(addresses.map((a) => a.toLowerCase())).size !== 2
  )
    throw Error("Both original phone identities are required for recovery");
  if (
    journal.addresses &&
    JSON.stringify(journal.addresses.map((a) => a.toLowerCase())) !==
      JSON.stringify(addresses.map((a) => a.toLowerCase()))
  )
    throw Error("Saved phone identity changed; no replacement was authorized");
  const files = recoveryFiles(directory, prepayment),
    original = await readFile(path.join(directory, "session.json"), "utf8");
  if (JSON.stringify(JSON.parse(original)) !== JSON.stringify(journal))
    throw Error("Session changed during recovery admission");
  const originalHash = createHash("sha256").update(original).digest("hex");
  let priorMarkerHash;
  if (prepayment) {
    const priorRaw = await readFile(recoveryFiles(directory).marker, "utf8");
    const prior = JSON.parse(priorRaw);
    assert.equal(prior.phase, "replacement-saved");
    assert.equal(prior.host?.code, journal.host.code);
    assert.equal(prior.base, journal.base);
    priorMarkerHash = createHash("sha256").update(priorRaw).digest("hex");
  }
  let marker = await optionalJson(files.marker);
  if (marker) {
    if (
      marker.phase !== "reserved" ||
      marker.originalHash !== originalHash ||
      marker.base !== journal.base ||
      marker.priorMarkerHash !== priorMarkerHash ||
      JSON.stringify(marker.addresses) !== JSON.stringify(addresses)
    )
      throw Error(
        "The one replacement-table allowance is already consumed or its saved identities changed",
      );
    return marker;
  }
  try {
    await writeFile(files.archive, original, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (
      error.code !== "EEXIST" ||
      (await readFile(files.archive, "utf8")) !== original
    )
      throw Error("Original session archive differs; recovery stopped");
  }
  marker = {
    version: 1,
    base: journal.base,
    originalHash,
    originalCode: journal.host.code,
    addresses,
    phase: "reserved",
    ...(prepayment ? { prepayment: true, priorMarkerHash } : {}),
  };
  await writeFile(files.marker, JSON.stringify(marker), {
    flag: "wx",
    mode: 0o600,
  });
  return marker;
}
export async function markReplacementCreating(directory, prepayment = false) {
  const file = recoveryFiles(directory, prepayment).marker,
    marker = await optionalJson(file);
  if (marker?.phase !== "reserved")
    throw Error(
      "Replacement creation was already attempted; inspect the preserved recovery marker",
    );
  marker.phase = "creating";
  await privateJson(file, marker);
}
export async function saveReplacementHost(directory, host, prepayment = false) {
  const file = recoveryFiles(directory, prepayment).marker,
    marker = await optionalJson(file);
  if (
    marker?.phase !== "creating" ||
    !host?.code ||
    !host.token ||
    !host.displayToken ||
    host.code === marker.originalCode
  )
    throw Error("Unexpected replacement table; recovery stopped");
  marker.phase = "replacement-saved";
  marker.host = host;
  await privateJson(file, marker);
  return marker;
}
export function ensReadiness(state) {
  const seats = state?.web3?.seats || [],
    party = state?.web3?.party?.status || "pending";
  const readyPhones = state?.players?.filter((p) => p.ready).length || 0,
    named = seats.filter((p) => p.named).length;
  const summary = `phones ${readyPhones}/2; ENS party ${party}; names ${named}/2 (${seats.map((p) => `seat ${p.slot + 1}: ${p.status}`).join(", ") || "waiting for bindings"})`;
  if (
    ["failed", "ended"].includes(party) ||
    seats.some((p) => p.status === "failed")
  )
    throw Error(
      `ENS terminal failure: ${summary}. Keep the session/profiles; no automatic new table or identity`,
    );
  return { ready: readyPhones === 2 && named === 2, summary };
}
export function hostedWorkerReady(health) {
  // ENS room health is unavailable until a room exists. Only the initialized
  // worker heartbeat can gate the very first table without circular waiting.
  return health?.worker === "up";
}
export async function readExistingPhoneIdentity(c, base, expected) {
  const page = await c.newPage(),
    url = `${base}/__acceptance_identity_probe__`;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Private identity check</title>",
    }),
  );
  try {
    await page.goto(url);
    const address = await page.evaluate(async () => {
      if (!localStorage.getItem("chonks.web3.key"))
        throw Error(
          "Original phone key is missing; recovery cannot create a fresh identity",
        );
      return (await import("/web3/phone-signer.js")).loadOrCreateKey();
    });
    if (expected && address.toLowerCase() !== expected.toLowerCase())
      throw Error("Original phone address changed; recovery stopped");
    return address;
  } finally {
    await page.close();
  }
}

export async function connectHostedScreens({
  savedHost,
  connectPhones,
  connectHost,
}) {
  // A hostless room pauses disconnected-seat cleanup. Restore its phones first
  // so returning the host cannot prune their retained identities after 30s.
  // A fresh/replacement room must still be created before any phone joins it.
  let phones = savedHost ? await connectPhones(savedHost) : null;
  const screen = await connectHost();
  phones ||= await connectPhones(screen.host);
  return { ...screen, phones };
}

const PHONE_BANKROLL_CHECK =
  "Both phones received confirmed Arc test-USDC starting play money";
export function retainedPhoneBankroll(journal, addresses) {
  if (!journal.checks?.includes(PHONE_BANKROLL_CHECK)) return false;
  assert.ok(
    Array.isArray(journal.addresses) && journal.addresses.length === 2,
    "Confirmed bankroll checkpoint requires its original identities",
  );
  assert.ok(
    Array.isArray(addresses) &&
      addresses.length === 2 &&
      addresses.every((a) => /^0x[\da-f]{40}$/i.test(a)) &&
      new Set(addresses.map((a) => a.toLowerCase())).size === 2,
    "Confirmed bankroll checkpoint requires two distinct phone identities",
  );
  assert.deepEqual(
    addresses.map((a) => a.toLowerCase()),
    journal.addresses.map((a) => a.toLowerCase()),
    "Confirmed bankroll identities changed",
  );
  return true;
}

export function createAcceptanceSave(file, snapshot) {
  let tail = Promise.resolve();
  return () => {
    const value = JSON.stringify(snapshot());
    // Concurrent independent actions must preserve every admission checkpoint.
    // A failed write poisons later saves, so no unjournaled action can proceed.
    tail = tail.then(async () => {
      await writeFile(file + ".tmp", value, { mode: 0o600 });
      await rename(file + ".tmp", file);
    });
    return tail;
  };
}

export async function holdHostedScreens({
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  report = console.error,
} = {}) {
  report(
    "PAUSED acceptance. Existing screens stay connected for 15 minutes; no further test actions or payment submissions will run. Keep this process open while the error is reviewed; Ctrl+C closes it.",
  );
  for (let n = 0; n < 30; n++) await wait(30000);
}

export async function runHostedBasic(
  {
    mock,
    base,
    directorySuffix = "",
    recoverExpiredTable = false,
    recoverPrepaymentTable = false,
  },
  { initDesktop, beforeStart, afterResult } = {},
) {
  if (!/^[a-z0-9-]{0,24}$/.test(directorySuffix))
    throw Error("Invalid acceptance directory suffix");
  const directory = path.resolve(
    (mock ? ".local/hosted-basic-mock" : ".local/hosted-basic") +
      (directorySuffix ? `-${directorySuffix}` : ""),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "session.json"),
    reportFile = path.join(directory, "report.json");
  let journal;
  try {
    journal = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (journal && (journal.base !== base || journal.mock !== mock))
    throw Error(
      "Existing acceptance journal belongs to another origin/mode; keep it for inspection",
    );
  journal ||= { version: 1, base, mock, checks: [], started: false };
  const prepayment =
    recoverPrepaymentTable ||
    journal.prepaymentTableRecovery === true ||
    !!(await optionalJson(recoveryFiles(directory, true).marker));
  const recoveryRequested = recoverExpiredTable || recoverPrepaymentTable;
  let recovery = await optionalJson(
    recoveryFiles(directory, prepayment).marker,
  );
  if (prepayment && recovery) {
    const priorRaw = await readFile(recoveryFiles(directory).marker, "utf8");
    assert.equal(
      recovery.priorMarkerHash,
      createHash("sha256").update(priorRaw).digest("hex"),
      "Prior recovery evidence changed",
    );
  }
  if (
    recovery &&
    (recovery.base !== base ||
      !["reserved", "creating", "replacement-saved"].includes(recovery.phase))
  )
    throw Error("Recovery marker differs from this acceptance");
  if (
    recovery &&
    ![recovery.originalCode, recovery.host?.code]
      .filter(Boolean)
      .includes(journal.host?.code)
  )
    throw Error("Saved session differs from the one-use recovery marker");
  if (recovery?.phase === "creating")
    throw Error(
      "Replacement creation acknowledgement is uncertain; inspect the marker. No second table will be created",
    );
  if (
    recovery?.phase === "replacement-saved" &&
    journal.host?.code === recovery.originalCode
  ) {
    if (prepayment)
      assert.equal(
        createHash("sha256")
          .update(await readFile(file, "utf8"))
          .digest("hex"),
        recovery.originalHash,
        "Session changed after replacement admission",
      );
    journal = {
      ...journal,
      host: recovery.host,
      addresses: recovery.addresses,
      expiredTableRecovery: true,
      ...(prepayment ? { prepaymentTableRecovery: true } : {}),
    };
    await privateJson(file, journal);
  }
  if (journal.completed) {
    if (recoveryRequested)
      throw Error("Completed acceptance cannot recover an expired table");
    console.log(
      "PASS acceptance already complete; no additional joins or transactions",
    );
    return;
  }
  const save = createAcceptanceSave(file, () => journal);
  const check = async (message) => {
    if (!journal.checks.includes(message)) journal.checks.push(message);
    await save();
    console.log(`PASS ${message}`);
  };
  const read = (route, options) => readHostedJson(base, route, options);
  const config = await read("/api/web3/live-config");
  assert.equal(
    config.ens,
    mock ? "mock" : "on",
    "ENS runtime is not activated in the requested mode",
  );
  assert.equal(
    config.arc,
    mock ? "mock" : "on",
    "Arc runtime is not activated in the requested mode",
  );
  const { buildId } = await read("/api/health");
  const buildChanged = journal.buildId && journal.buildId !== buildId;
  if (buildChanged && !recoveryRequested)
    throw Error(
      "Build changed during acceptance; keep the journal and inspect before continuing",
    );
  const contexts = [],
    errors = [];
  let observer, display, state;
  const emit = (s, event, data) =>
    new Promise((resolve, reject) =>
      s
        .timeout(20000)
        .emit(event, data, (error, reply) =>
          error ? reject(error) : resolve(reply),
        ),
    );
  async function observe(identity) {
    display?.close();
    display = createHostedDisplayObserver({ base, identity, buildId });
    observer = display.socket;
    await display.ready();
    state = display.getState();
  }
  async function until(label, predicate, timeout = 120000, detail = () => "") {
    const deadline = Date.now() + timeout;
    let progress = Date.now();
    while (Date.now() < deadline) {
      display?.assertHealthy();
      state = display?.getState();
      if ((!display || state) && (await predicate())) return;
      if (Date.now() - progress > 30000) {
        const status =
          display && !state
            ? "read-only display reconnecting; previous room snapshot discarded"
            : detail();
        console.log(`WAIT ${label}${status ? ` — ${status}` : ""}`);
        progress = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw Error(
      `Timed out: ${label}${detail() ? ` — ${detail()}` : ""}. Keep the saved identities and journal; no automatic fresh run`,
    );
  }
  const contextByName = new Map();
  async function context(name, viewport) {
    if (contextByName.has(name)) return contextByName.get(name);
    const c = await chromium.launchPersistentContext(
      path.join(directory, name),
      { viewport, headless: true },
    );
    contexts.push(c);
    contextByName.set(name, c);
    c.on("page", (page) =>
      page.on("pageerror", (e) => errors.push(e.name || "BrowserError")),
    );
    return c;
  }
  let replacing = false,
    screensConnected = false;
  try {
    let workerProgress = "waiting for worker heartbeat";
    await until(
      "worker readiness before any table or phone action",
      async () => {
        try {
          const response = await fetch(`${base}/api/web3/health`, {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw Error("Worker health unavailable");
          const health = await response.json();
          workerProgress = `worker ${health.worker || "unknown"}; ENS ${health.providers?.ens || "unknown"}; Arc ${health.providers?.arc || "unknown"}`;
          return hostedWorkerReady(health);
        } catch {
          workerProgress = "health endpoint temporarily unavailable";
          return false;
        }
      },
      300000,
      () => workerProgress,
    );
    // Resume only an existing live table. Do not open the host UI if the saved
    // table disappeared: it would otherwise create a fresh on-chain namespace.
    if (journal.host) {
      try {
        await observe(journal.host);
      } catch (error) {
        if (!recoveryRequested || !error.expiredTable) throw error;
        if (recovery?.phase === "replacement-saved")
          throw Error(
            "The single replacement table also expired; no additional table is allowed",
          );
        if (prepayment) {
          assertPrepaymentRecovery(journal);
          await confirmPrepaymentOperations(journal, read);
        } else assertRecoverableSession(journal);
        await confirmTableMissing(base, journal.host);
        const addresses = [];
        for (const [index, width] of [320, 390].entries())
          addresses.push(
            await readExistingPhoneIdentity(
              await context(`phone-${index + 1}`, { width, height: 844 }),
              base,
              journal.addresses?.[index] || recovery?.addresses?.[index],
            ),
          );
        if (prepayment)
          for (let i = 1; i <= 2; i++)
            await readExistingPhoneIdentity(
              await context(`spectator-${i}`, { width: 390, height: 844 }),
              base,
              journal.marketAcceptance.addresses[`spectator-${i}`],
            );
        recovery = await reserveExpiredRecovery(
          directory,
          journal,
          addresses,
          prepayment,
        );
        replacing = true;
        journal = { ...journal, host: null, addresses };
      }
      if (buildChanged && !replacing)
        throw Error(
          "Build changed for an existing table; replacement requires confirmed disappearance",
        );
    } else if (recoveryRequested)
      throw Error(
        "Recovery requires the original saved table and existing phone profiles",
      );
    journal.buildId = buildId;
    if (replacing) await markReplacementCreating(directory, prepayment);
    const { desktop, phones } = await connectHostedScreens({
      savedHost: journal.host,
      async connectHost() {
        const desktopContext = await context("desktop", {
          width: 1280,
          height: 720,
        });
        if (journal.host)
          await desktopContext.addInitScript(
            (host) =>
              sessionStorage.setItem("chonks.host", JSON.stringify(host)),
            journal.host,
          );
        else if (replacing)
          await desktopContext.addInitScript(() =>
            sessionStorage.removeItem("chonks.host"),
          );
        const desktop = await desktopContext.newPage();
        if (initDesktop) await initDesktop(desktop);
        await desktop.goto(base + "/?shell=os");
        await desktop.waitForFunction(() =>
          sessionStorage.getItem("chonks.host"),
        );
        const host = await desktop.evaluate(() =>
          JSON.parse(sessionStorage.getItem("chonks.host")),
        );
        if (journal.host)
          assert.equal(
            host.code,
            journal.host.code,
            "Host unexpectedly replaced the saved table",
          );
        else {
          if (replacing) {
            recovery = await saveReplacementHost(directory, host, prepayment);
            journal.expiredTableRecovery = true;
            if (prepayment) journal.prepaymentTableRecovery = true;
          }
          journal.host = host;
          await save();
          await observe(host);
        }
        return { desktop, host };
      },
      async connectPhones(host) {
        const phones = [];
        for (const [index, width] of [320, 390].entries()) {
          const c = await context(`phone-${index + 1}`, { width, height: 844 });
          if (journal.addresses?.[index])
            await readExistingPhoneIdentity(c, base, journal.addresses[index]);
          const phone = await c.newPage();
          await phone.goto(`${base}/controller?room=${host.code}`);
          // Enabled only by the join acknowledgement. Do not restore the host
          // while a phone has merely loaded and its reconnect is still pending.
          await phone.waitForFunction(
            () => document.getElementById("touch-mode")?.disabled === false,
          );
          if (await phone.locator("#touch-mode").isVisible())
            await phone.locator("#touch-mode").click();
          phones.push(phone);
        }
        return phones;
      },
    });
    screensConnected = true;
    const addresses = await Promise.all(
      phones.map((phone) =>
        phone.evaluate(async () =>
          (await import("/web3/phone-signer.js")).loadOrCreateKey(),
        ),
      ),
    );
    if (journal.addresses)
      assert.deepEqual(
        addresses.map((a) => a.toLowerCase()),
        journal.addresses.map((a) => a.toLowerCase()),
        "Original phone addresses must be preserved",
      );
    const bankrollAlreadyConfirmed = retainedPhoneBankroll(journal, addresses);
    journal.addresses = addresses;
    await save();
    await until(
      "two ready phone controllers and ENS seat names",
      () => ensReadiness(state).ready,
      // A resumed test may sit behind already-admitted cleanup transactions.
      // Stay connected through that bounded backlog; terminal errors still stop
      // immediately rather than creating another room or resetting a budget.
      mock ? 60000 : 1800000,
      () => ensReadiness(state).summary,
    );
    if (!mock) {
      assert.ok(
        state.web3.party?.name?.endsWith(".play.funcaster.eth"),
        "Expected the newly selected parent namespace",
      );
      assert.ok(
        state.web3.seats
          .filter((p) => p.named)
          .every((p) => p.name.endsWith(".play.funcaster.eth")),
        "A seat was issued under another parent",
      );
    }
    await check(
      "Two phone controllers joined; party and both seat ENS names are ready",
    );
    // Funding belongs to the retained identities, not to each replacement table.
    // Reuse only a previously passed checkpoint after verifying both browser keys.
    // Market hooks still fetch current balances before any new payment.
    if (bankrollAlreadyConfirmed) {
      console.log(
        "REUSE previously confirmed phone bankrolls for the same two identities",
      );
    } else {
      let dripProgress = "confirmed USDC bankrolls 0/2";
      await until(
        "Arc starting play-money receipts for both phones",
        async () => {
          const ledger = await read("/api/records/ledger");
          const rows = ledger.rows.filter(
            (r) =>
              r.type === "arc.drip" &&
              r.status === "done" &&
              r.mock === mock &&
              (mock || /^0x[\da-f]{64}$/i.test(r.tx)),
          );
          const funded = journal.addresses.filter((address) =>
            rows.some(
              (r) =>
                r.data.address?.toLowerCase() === address.toLowerCase() &&
                r.data.asset?.toLowerCase() === "usdc" &&
                BigInt(r.data.amount || "0") > 0n,
            ),
          ).length;
          dripProgress = `confirmed USDC bankrolls ${funded}/2`;
          return funded === 2;
        },
        mock ? 60000 : 900000,
        () => dripProgress,
      );
      await check(PHONE_BANKROLL_CHECK);
    }
    const hooks = {
      base,
      mock,
      directory,
      journal,
      save,
      read,
      desktop,
      phones,
      context,
      until,
      emit,
      observer,
      getState: () => display?.getState(),
      check,
    };
    if (!journal.started) {
      for (let n = 0; n < 15; n++) {
        for (const b of await desktop
          .locator(
            '[data-id="show-desktop"], [data-id="who-continue"], [data-id="continue-desktop"]',
          )
          .all())
          if (await b.isVisible()) await b.click();
        if (
          (await desktop.locator('[data-id="game-star-catch"]').isVisible()) &&
          !(await desktop
            .locator('[data-window="welcome"]')
            .isVisible()
            .catch(() => false))
        )
          break;
        await desktop.keyboard.press("Space");
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await desktop.locator('[data-id="game-star-catch"]').click();
      await desktop.locator('[data-id="gp-start"]').waitFor();
    }
    if (beforeStart) {
      journal.hookStarted = true;
      await save();
      await beforeStart(hooks);
    }
    if (!journal.started) {
      // Persist the start intent before the user-facing start action. A restart
      // may watch this round, but never silently starts a second one.
      journal.started = true;
      await save();
      await desktop.locator('[data-id="gp-start"]').click();
    }
    await until(
      "one complete verified Star Catch round",
      () =>
        state?.result?.gameId === "chonks.star-catch" &&
        state.result.status === "completed" &&
        state.result.verification === "verified",
      150000,
    );
    journal.resultHash = state.result.hash;
    assert.equal(state.result.scores.length, 2);
    await until("durable Hall result", async () =>
      (await read("/api/records/?game=chonks.star-catch")).records.some(
        (row) =>
          row.id === journal.resultHash && row.gameVerification === "verified",
      ),
    );
    await check(
      "One two-player Star Catch round completed with a verified replay and durable Hall result",
    );
    if (afterResult) await afterResult(hooks);
    for (const [label, page] of [
      ["desktop", desktop],
      ["phone-1", phones[0]],
      ["phone-2", phones[1]],
    ]) {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${label} horizontal overflow`,
      );
      await page.screenshot({
        path: path.join(directory, `${label}.png`),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, [], "Browser page errors occurred");
    await check("Desktop and both phone layouts fit; no browser script errors");
    journal.completed = true;
    await save();
    await writeFile(
      reportFile,
      JSON.stringify(
        {
          mode: mock ? "mock" : "public-testnet",
          origin: base,
          buildId,
          resultHash: journal.resultHash,
          checks: journal.checks,
          caveats: afterResult
            ? "Extension acceptance evidence is in the accompanying hook report; no independent two-host audit or physical motion test."
            : "No stakes, predictions, creator purchases, Champion claim, physical motion, or independent two-host audit performed by this basic smoke.",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      `PASS basic acceptance complete. Public report: ${reportFile}. Browser profiles/session journal are private; never upload them.`,
    );
  } catch (error) {
    if (!mock && screensConnected) {
      console.error(`Acceptance paused: ${error.message}`);
      await holdHostedScreens();
    }
    throw error;
  } finally {
    display?.close();
    for (const c of contexts.reverse()) await c.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    await runHostedBasic(acceptanceOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `STOPPED ${error.message}. Keep .local/hosted-basic*; never share browser profiles, recovery keys or session.json.`,
    );
    process.exitCode = 1;
  }
}
