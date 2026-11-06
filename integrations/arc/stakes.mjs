import { getAddress, verifyTypedData } from "viem";
import { payoutVector, placesFromResult } from "./payouts.mjs";
import { settleData, contestData } from "./signatures.mjs";

const same = (a, b) =>
  typeof a === "string" && a.toLowerCase() === b?.toLowerCase();
const hex32 = (s) => /^0x[\da-f]{64}$/i.test(s || "");
const sig = (s) => /^0x[\da-f]{130}$/i.test(s || "");
const states = [
  "Funding",
  "Locked",
  "Proposed",
  "Contested",
  "Settled",
  "Refunded",
];
const final = (s) => ["Settled", "Refunded"].includes(s);

// CPU-only policy. The adapter supplies canonical worker observations and puts
// commands in the durable outbox. Nothing here reads RPC, disk, sockets or keys.
export function createStakesAttempt({
  potId,
  config,
  termsHash,
  terms,
  roster,
  gameKey,
  now = Date.now,
  proofMaxAgeMs = 5000,
  agreeDelayMs = 5000,
  oracleDelayMs = 60000,
  minHumans = 2,
}) {
  if (
    !hex32(potId) ||
    !hex32(termsHash) ||
    !gameKey ||
    !["on", "mock"].includes(config.mode) ||
    config.chainId !== 5042002 ||
    !Number.isSafeInteger(proofMaxAgeMs) ||
    proofMaxAgeMs < 1 ||
    !Number.isSafeInteger(agreeDelayMs) ||
    !Number.isSafeInteger(oracleDelayMs) ||
    agreeDelayMs < 5000 ||
    oracleDelayMs < 60000 ||
    !Number.isInteger(minHumans) ||
    minHumans < 2 ||
    minHumans > 4
  )
    throw Error("Invalid stakes configuration");
  getAddress(config.contract);
  if (
    !Array.isArray(roster) ||
    roster.length < minHumans ||
    roster.length > 4 ||
    new Set(roster.map((r) => r.slot)).size !== roster.length ||
    new Set(roster.map((r) => r.address?.toLowerCase())).size !==
      roster.length ||
    roster.some(
      (r) =>
        !Number.isInteger(r.slot) ||
        r.slot < 0 ||
        r.slot > 3 ||
        !r.binding ||
        r.kind !== "human",
    )
  )
    throw Error("Verified human roster required");
  roster.forEach((r) => getAddress(r.address));
  const seats = structuredClone(roster),
    slots = seats.map((s) => s.slot);
  const fixed = structuredClone(terms);
  const stake = BigInt(fixed.stake);
  payoutVector(
    stake,
    slots.map(() => 1),
    fixed.rule,
  );
  if (
    !Number.isSafeInteger(fixed.fundDeadline) ||
    !Number.isSafeInteger(fixed.settleDeadline) ||
    !Number.isSafeInteger(fixed.minPlaySeconds) ||
    fixed.minPlaySeconds < 1 ||
    !Number.isSafeInteger(fixed.challengeWindow) ||
    fixed.challengeWindow < 60 ||
    fixed.fundDeadline * 1000 <= now() ||
    fixed.fundDeadline + fixed.minPlaySeconds >= fixed.settleDeadline
  )
    throw Error("Invalid stakes deadlines");
  const domain = { chainId: config.chainId, contract: config.contract };
  const approvals = new Map(),
    contests = new Map();
  let proof = null,
    proofError = false,
    cancelled = false,
    abandoned = false,
    matchId = null,
    result = null,
    resultAt = 0,
    generation = 0;
  const rosterMatches = (current) =>
    Array.isArray(current) &&
    current.length === seats.length &&
    seats.every((s) =>
      current.some(
        (r) =>
          r.slot === s.slot &&
          r.binding === s.binding &&
          same(r.address, s.address) &&
          r.kind === "human" &&
          r.ready &&
          r.connected,
      ),
    );
  function observe(input) {
    // Observations must come from the configured lane, never from a client send
    // acknowledgement. Mock output can only drive an explicitly mock attempt.
    if (
      !input ||
      input.mode !== config.mode ||
      input.chainId !== config.chainId ||
      !same(input.contract, config.contract) ||
      !same(input.potId, potId) ||
      !same(input.termsHash, termsHash) ||
      !hex32(input.blockHash) ||
      !/^\d{1,20}$/.test(String(input.blockNumber)) ||
      !states.includes(input.state) ||
      !Number.isSafeInteger(input.chainTime) ||
      !Number.isSafeInteger(input.observedAt) ||
      input.observedAt > now() + 1000 ||
      now() - input.observedAt > proofMaxAgeMs ||
      input.chainTime * 1000 > now() + 5000 ||
      now() - input.chainTime * 1000 > 30000 ||
      !Number.isInteger(input.fundedBitmap) ||
      input.fundedBitmap < 0 ||
      input.fundedBitmap >= 1 << seats.length ||
      (input.state !== "Funding" &&
        input.state !== "Refunded" &&
        (input.fundedBitmap !== (1 << seats.length) - 1 ||
          !Number.isSafeInteger(input.lockedAt) ||
          input.lockedAt > input.chainTime)) ||
      (input.state === "Proposed" &&
        (!Number.isSafeInteger(input.proposalAt) ||
          input.proposalAt > input.chainTime ||
          !hex32(input.placesHash)))
    ) {
      proofError = true;
      return false;
    }
    if (
      proof &&
      (BigInt(input.blockNumber) < BigInt(proof.blockNumber) ||
        (BigInt(input.blockNumber) === BigInt(proof.blockNumber) &&
          (!same(input.blockHash, proof.blockHash) ||
            input.state !== proof.state ||
            input.fundedBitmap !== proof.fundedBitmap)) ||
        (proof.fundedBitmap & input.fundedBitmap) !== proof.fundedBitmap ||
        (proof.state !== "Funding" && input.state === "Funding") ||
        (["Proposed", "Contested"].includes(proof.state) &&
          input.state === "Locked") ||
        (proof.state === "Contested" && input.state === "Proposed") ||
        (final(proof.state) && input.state !== proof.state))
    ) {
      proofError = true;
      return false;
    }
    proof = structuredClone(input);
    proofError = false;
    return true;
  }
  function startReason(context) {
    if (cancelled || final(proof?.state)) return null;
    if (matchId)
      return "This pot already belongs to a round. Turn stakes off for the next one.";
    if (context.gameKey !== gameKey || !rosterMatches(context.roster))
      return "Players or rules changed. Cancel these stakes and choose them again.";
    if (
      !context.workerUp ||
      proofError ||
      !proof ||
      now() - proof.observedAt > proofMaxAgeMs
    )
      return "Checking the stakes. You can play without stakes while services recover.";
    if (now() >= fixed.settleDeadline * 1000)
      return "These stakes expired. Cancel them to play without stakes.";
    if (proof.state !== "Locked") {
      const count = slots.filter(
        (_, i) => proof.fundedBitmap & (1 << i),
      ).length;
      return `Waiting for ${seats.length - count} of ${seats.length} players to put in their stake.`;
    }
    return null;
  }
  function started(id, context) {
    if (
      !id ||
      matchId ||
      cancelled ||
      final(proof?.state) ||
      startReason(context)
    )
      throw Error("The pot is not ready for this round");
    matchId = id;
    generation++;
  }
  function finish(value, { humansRemaining }) {
    if (
      !matchId ||
      value?.matchId !== matchId ||
      result ||
      abandoned ||
      cancelled
    )
      return false;
    generation++;
    if (
      !Number.isInteger(humansRemaining) ||
      humansRemaining < minHumans ||
      !/^[\da-f]{64}$/.test(value.hash || "")
    ) {
      abandoned = true;
      return false;
    }
    try {
      const places = placesFromResult(value, slots);
      result = {
        hash: value.hash,
        places,
        payouts: payoutVector(stake, places, fixed.rule).map(String),
      };
      resultAt = now();
      return true;
    } catch {
      abandoned = true;
      return false;
    }
  }
  async function sign(slot, kind, signature) {
    const seat = seats.find((s) => s.slot === slot),
      version = generation;
    if (
      !seat ||
      !sig(signature) ||
      !["settle", "contest"].includes(kind) ||
      cancelled ||
      abandoned ||
      !result ||
      final(proof?.state)
    )
      return false;
    if (
      kind === "settle" &&
      (now() < resultAt + agreeDelayMs ||
        now() >= fixed.settleDeadline * 1000 ||
        contests.size ||
        proof?.state !== "Locked")
    )
      return false;
    // An already-sent agreement cannot be revoked. The phone removes Dispute
    // after signing; it must never imply a signed settlement can be cancelled.
    if (kind === "contest" && approvals.has(slot)) return false;
    const data =
      kind === "settle"
        ? settleData(domain, { potId, places: result.places })
        : contestData(domain, potId);
    let valid = false;
    try {
      valid = await verifyTypedData({
        ...data,
        address: seat.address,
        signature,
      });
    } catch {}
    if (
      !valid ||
      version !== generation ||
      cancelled ||
      abandoned ||
      final(proof?.state)
    )
      return false;
    if (
      kind === "settle" &&
      (contests.size ||
        now() >= fixed.settleDeadline * 1000 ||
        proof?.state !== "Locked")
    )
      return false;
    if (kind === "contest" && approvals.has(slot)) return false;
    (kind === "settle" ? approvals : contests).set(slot, signature);
    return true;
  }
  function cancel() {
    if (matchId)
      throw Error(
        "A running or completed round cannot cancel its signed terms",
      );
    cancelled = true;
    generation++;
  }
  function abandon() {
    if (final(proof?.state)) return;
    abandoned = true;
    generation++;
  }
  function commands() {
    if (!proof || proofError || now() - proof.observedAt > proofMaxAgeMs)
      return [];
    const make = (kind, payload = {}) => ({
      kind,
      key: `${potId}:${kind}`,
      payload: { potId, ...payload },
    });
    if (final(proof.state))
      return seats.map((seat) => ({
        ...make("claim", { seat: seat.address }),
        key: `${potId}:claim:${seat.address.toLowerCase()}`,
      }));
    if (proof.state === "Contested") return [make("refund")];
    if (
      (proof.state === "Funding" && proof.chainTime >= fixed.fundDeadline) ||
      (proof.state === "Locked" && proof.chainTime >= fixed.settleDeadline)
    )
      return [make("refund")];
    if (proof.state === "Proposed") {
      if (contests.size)
        return [...contests].map(([slot, signature]) => ({
          ...make("contest", {
            seat: seats.find((s) => s.slot === slot).address,
            signature,
          }),
          key: `${potId}:contest:${slot}`,
        }));
      // Never finalize an abandoned or cancelled game. The adapter still exposes
      // permissionless chain actions, but our oracle cannot manufacture a result.
      if (
        !abandoned &&
        !cancelled &&
        result &&
        same(
          proof.placesHash,
          settleData(domain, { potId, places: result.places }).message
            .placesHash,
        ) &&
        proof.chainTime >= proof.proposalAt + fixed.challengeWindow
      )
        return [make("finalize", { places: result.places })];
      return [];
    }
    if (cancelled || abandoned || !result || proof.state !== "Locked")
      return [];
    if (approvals.size === seats.length && !contests.size)
      return [
        make("settle", {
          places: result.places,
          sigs: seats.map((seat) => approvals.get(seat.slot)),
        }),
      ];
    if (
      now() >= resultAt + oracleDelayMs &&
      Number.isSafeInteger(proof.lockedAt) &&
      proof.chainTime >= proof.lockedAt + fixed.minPlaySeconds &&
      proof.chainTime < fixed.settleDeadline
    )
      return [
        make("propose", {
          places: result.places,
          resultHash: `0x${result.hash}`,
        }),
      ];
    return [];
  }
  function view() {
    const status = final(proof?.state)
      ? proof.state.toLowerCase()
      : cancelled || abandoned
        ? "refund-pending"
        : contests.size
          ? "contested"
          : result
            ? "settling"
            : matchId
              ? "playing"
              : proof?.state === "Locked"
                ? "locked"
                : proof
                  ? "funding"
                  : "terms";
    return {
      potId,
      mode: config.mode,
      playMoney: true,
      status,
      termsHash,
      ...structuredClone(fixed),
      seats: seats.map(({ binding, ...seat }) => seat),
      funded: proof?.fundedBitmap ?? 0,
      matchId,
      cancelled,
      abandoned,
      result: result ? structuredClone(result) : null,
      agreeAt: result ? resultAt + agreeDelayMs : null,
      agreed: [...approvals.keys()],
      disputed: [...contests.keys()],
      chainState: proof?.state ?? null,
      chainVerified: false,
    };
  }
  return {
    observe,
    startReason,
    started,
    finish,
    sign,
    cancel,
    abandon,
    commands,
    view,
  };
}
