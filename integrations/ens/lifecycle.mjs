import path from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { encodeFunctionData, keccak256, stringToHex, zeroAddress } from "viem";
import { atomicJson, readJson, digest } from "../shared/outbox.mjs";
import { acquireWorkerLock } from "../shared/worker.mjs";
import { createHierarchyReader } from "./hierarchy.mjs";
import { checkedParent, labelId } from "./names.mjs";
import { partyLabel, seatLabel } from "./labels.mjs";
import {
  request,
  textCalls,
  addressCall,
  readRecord,
} from "./lifecycle-calls.mjs";
import { requireEns } from "./errors.mjs";

const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const address = (a) => /^0x[\da-fA-F]{40}$/.test(a) && !same(a, zeroAddress);
const identifier = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(id);
const available = (s, time) =>
  s.status === 0 || (s.status === 2 && s.expiry <= time);

// Worker-only adapter. The transaction port must durably reconcile each ID and
// enforce nonce/spend/kill limits. No wallet or secret is loaded by this module.
export async function createEnsLifecycle({
  dir,
  client,
  protocol,
  config,
  transact,
  discoverPlay,
}) {
  requireEns(
    typeof transact === "function",
    "INVALID_CONFIG",
    "A reconciled transaction port is required",
  );
  const parent = checkedParent(config.ENS_PARENT),
    owner = config.ENS_REGISTRAR_ADDRESS;
  requireEns(
    address(owner),
    "INVALID_CONFIG",
    "A public registrar address is required",
  );
  requireEns(
    Number.isInteger(config.ENS_WARM_POOL) &&
      config.ENS_WARM_POOL >= 0 &&
      config.ENS_WARM_POOL <= 10,
    "INVALID_CONFIG",
    "Warm pool must contain zero to ten pairs",
  );
  requireEns(
    Number.isInteger(config.ENS_PARTY_TTL_HOURS) &&
      config.ENS_PARTY_TTL_HOURS > 0 &&
      config.ENS_PARTY_TTL_HOURS <= 4,
    "INVALID_CONFIG",
    "Party TTL must be one to four hours",
  );
  const origin = new URL(config.PUBLIC_ORIGIN);
  requireEns(
    origin.protocol === "https:" &&
      !origin.username &&
      !origin.password &&
      !origin.search &&
      !origin.hash &&
      origin.pathname === "/",
    "INVALID_CONFIG",
    "Party records require a public HTTPS origin",
  );
  // Validate protocol configuration before taking the on-disk process lock.
  const reader = createHierarchyReader({ client, protocol, parent });
  const folder = path.join(dir, "ens"),
    file = path.join(folder, "lifecycle.json");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const unlock = await acquireWorkerLock(folder);
  let state;
  const context = {
    parent,
    owner: owner.toLowerCase(),
    origin: origin.origin,
    chainId: protocol.chainId,
    factory: protocol.contracts.factory.toLowerCase(),
  };
  try {
    state = await readJson(file);
    if (!state) {
      state = {
        version: 1,
        context,
        epoch: randomUUID(),
        nextPair: 0,
        pairs: [],
        parties: {},
      };
      await atomicJson(file, state);
    }
    requireEns(
      state.version === 1 && isDeepStrictEqual(state.context, context),
      "STATE_CONFLICT",
      "ENS lifecycle store belongs to a different configuration",
    );
  } catch (error) {
    await unlock();
    throw error;
  }
  let tail = Promise.resolve(),
    closed = false;
  const serialize = (fn) => {
    requireEns(!closed, "CLOSED", "ENS adapter is closed");
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  const save = () => atomicJson(file, state);
  const read = (kind, target, fn, args = []) =>
    client.readContract(request(kind, target, fn, args));
  discoverPlay ||= () =>
    reader.walk(`play.${parent}`, {
      expectedOwner: owner,
      requireResolver: true,
    });
  const send = async (id, kind, target, fn, args) =>
    transact(id, request(kind, target, fn, args, owner));
  async function play() {
    const proof = await discoverPlay();
    requireEns(
      proof.name === `play.${parent}` &&
        same(proof.leaf.owner, owner) &&
        address(proof.leaf.subregistry),
      "OWNER_MISMATCH",
      "Expected canonical play registry is unavailable",
    );
    if (state.playRegistry)
      requireEns(
        same(state.playRegistry, proof.leaf.subregistry),
        "STATE_CONFLICT",
        "Play registry changed; inspect the lifecycle store",
      );
    else {
      state.playRegistry = proof.leaf.subregistry;
      await save();
    }
    return proof;
  }
  async function verifyProxy(target, implementation, kind, roles) {
    requireEns(
      same(
        await read("factory", protocol.contracts.factory, "verifyContract", [
          target,
        ]),
        implementation,
      ),
      "UNTRUSTED_REGISTRY",
      "Unexpected lifecycle proxy implementation",
    );
    requireEns(
      await read(kind, target, "hasRootRoles", [roles, owner]),
      "MISSING_ROLES",
      "Registrar lifecycle roles are missing",
    );
  }
  async function preparePair() {
    let pair = state.pairs.find((p) => p.status === "preparing");
    if (!pair) {
      const id = `${state.epoch}:${state.nextPair++}`;
      pair = {
        id,
        status: "preparing",
        registrySalt: String(
          BigInt(keccak256(stringToHex(`chonks:registry:${id}`))),
        ),
        resolverSalt: String(
          BigInt(keccak256(stringToHex(`chonks:resolver:${id}`))),
        ),
      };
      state.pairs.push(pair);
      await save();
    }
    for (const [kind, implementation, roles] of [
      ["registry", protocol.contracts.userRegistryImpl, protocol.registryRoles],
      ["resolver", protocol.contracts.resolverImpl, protocol.resolverRoles],
    ]) {
      const salt = BigInt(pair[`${kind}Salt`]);
      const target = await read(
        "factory",
        protocol.contracts.factory,
        "predictProxyAddress",
        [owner, salt],
      );
      if (pair[kind])
        requireEns(
          same(pair[kind], target),
          "STATE_CONFLICT",
          "Predicted ENS proxy changed",
        );
      else {
        pair[kind] = target;
        await save();
      }
      const code = await client.getCode({ address: target });
      if (!code || code === "0x") {
        const grants = [{ account: owner, roleBitmap: roles }];
        const init = encodeFunctionData(
          request(
            kind,
            target,
            "initialize",
            kind === "registry" ? [grants] : [grants, []],
          ),
        );
        await send(
          `pair:${pair.id}:${kind}`,
          "factory",
          protocol.contracts.factory,
          "deployProxy",
          [implementation, salt, init],
        );
      }
      await verifyProxy(target, implementation, kind, roles);
    }
    pair.status = "ready";
    await save();
    return pair;
  }
  async function refill() {
    await play();
    while (
      state.pairs.filter((p) => p.status === "ready").length <
      config.ENS_WARM_POOL
    )
      await preparePair();
    return { ready: state.pairs.filter((p) => p.status === "ready").length };
  }
  async function verifyParty(p) {
    const proof = await play();
    const head = await client.getBlock({ blockTag: "latest" });
    const s = await read("registry", proof.leaf.subregistry, "getState", [
      labelId(p.label),
    ]);
    requireEns(
      s.status === protocol.registeredStatus &&
        same(s.latestOwner, owner) &&
        s.expiry === BigInt(p.expiresAt) &&
        s.expiry > head.timestamp,
      "PARTY_CHANGED",
      "Party is expired, ended or changed on chain",
    );
    requireEns(
      same(
        await read("registry", proof.leaf.subregistry, "getSubregistry", [
          p.label,
        ]),
        p.registry,
      ) &&
        same(
          await read("registry", proof.leaf.subregistry, "getResolver", [
            p.label,
          ]),
          p.resolver,
        ),
      "PARTY_CHANGED",
      "Party links changed on chain",
    );
    return { proof, s };
  }
  function partyResult(p) {
    return {
      name: p.name,
      registry: p.registry,
      resolver: p.resolver,
      expiresAt: p.expiresAt,
      status: p.status,
    };
  }
  async function open(input) {
    requireEns(
      input &&
        identifier(input.partyId) &&
        typeof input.game === "string" &&
        /^chonks\.[a-z0-9-]{1,64}$/.test(input.game),
      "INVALID_JOB",
      "Invalid party-open job",
    );
    partyLabel(input.code);
    const key = digest(input.partyId),
      fingerprint = digest(
        JSON.stringify({ code: input.code, game: input.game }),
      );
    let p = state.parties[key];
    if (p) {
      requireEns(
        p.fingerprint === fingerprint,
        "IDEMPOTENCY_CONFLICT",
        "Party-open payload changed",
      );
      requireEns(
        !["ending", "ended"].includes(p.status),
        "PARTY_ENDED",
        "An ended party cannot be reopened",
      );
      if (p.status === "ready") {
        await verifyParty(p);
        return partyResult(p);
      }
    }
    const proof = await play();
    if (!p) {
      const pair =
        state.pairs.find((x) => x.status === "ready") || (await preparePair());
      const head = await client.getBlock({ blockTag: "latest" });
      let label;
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = partyLabel(input.code, attempt);
        if (
          available(
            await read("registry", proof.leaf.subregistry, "getState", [
              labelId(candidate),
            ]),
            head.timestamp,
          )
        ) {
          label = candidate;
          break;
        }
      }
      requireEns(label, "COLLISION_LIMIT", "No party label is available");
      const wanted = head.timestamp + BigInt(config.ENS_PARTY_TTL_HOURS * 3600);
      const expiry = wanted < proof.expiresAt ? wanted : proof.expiresAt;
      requireEns(
        expiry > head.timestamp + 60n,
        "EXPIRED",
        "Parent is too close to expiry",
      );
      p = {
        fingerprint,
        pairId: pair.id,
        label,
        name: `${label}.play.${parent}`,
        registry: pair.registry,
        resolver: pair.resolver,
        expiresAt: String(expiry),
        code: input.code,
        game: input.game,
        status: "opening",
        seats: {},
      };
      pair.status = "reserved";
      pair.party = key;
      state.parties[key] = p;
      await save();
    }
    requireEns(
      BigInt(p.expiresAt) > (await client.getBlock()).timestamp,
      "EXPIRED",
      "Pending party expired; do not recreate it automatically",
    );
    await verifyProxy(
      p.registry,
      protocol.contracts.userRegistryImpl,
      "registry",
      protocol.registryRoles,
    );
    await verifyProxy(
      p.resolver,
      protocol.contracts.resolverImpl,
      "resolver",
      protocol.resolverRoles,
    );
    const [parentAddress, parentLabel] = await read(
      "registry",
      p.registry,
      "getParent",
    );
    if (same(parentAddress, zeroAddress))
      await send(`party:${key}:parent`, "registry", p.registry, "setParent", [
        proof.leaf.subregistry,
        p.label,
      ]);
    else
      requireEns(
        same(parentAddress, proof.leaf.subregistry) && parentLabel === p.label,
        "NONCANONICAL",
        "Reserved pair has another canonical parent",
      );
    const records = {
      "chonks.v": "1",
      "chonks.code": p.code,
      "chonks.relay": origin.origin,
      "chonks.game": p.game,
    };
    await send(`party:${key}:records`, "resolver", p.resolver, "multicall", [
      textCalls(p.name, records),
    ]);
    const s = await read("registry", proof.leaf.subregistry, "getState", [
      labelId(p.label),
    ]);
    if (available(s, (await client.getBlock()).timestamp))
      await send(
        `party:${key}:register`,
        "registry",
        proof.leaf.subregistry,
        "register",
        [
          p.label,
          owner,
          p.registry,
          p.resolver,
          protocol.registryRoles,
          BigInt(p.expiresAt),
        ],
      );
    await verifyParty(p);
    for (const [k, v] of Object.entries(records))
      requireEns(
        (await readRecord(client, p.resolver, p.name, k)) === v,
        "RECORD_MISMATCH",
        "Party records did not read back",
      );
    p.status = "ready";
    state.pairs.find((x) => x.id === p.pairId).status = "used";
    await save();
    return partyResult(p);
  }
  const getParty = (partyId) => {
    requireEns(identifier(partyId), "INVALID_JOB", "Invalid party ID");
    const p = state.parties[digest(partyId)];
    requireEns(p, "PARTY_UNKNOWN", "Party must be opened first");
    return p;
  };
  async function mint(input) {
    const p = getParty(input?.partyId);
    requireEns(
      p.status === "ready",
      "PARTY_NOT_READY",
      "Party is not ready for a seat",
    );
    requireEns(
      identifier(input.seatId) &&
        address(input.address) &&
        !same(input.address, owner),
      "INVALID_JOB",
      "Invalid seat identity",
    );
    const base = seatLabel(input.nickname, input.slot);
    requireEns(
      typeof input.shape === "string" &&
        /^[a-z]{1,16}$/.test(input.shape) &&
        /^#[\da-fA-F]{6}$/.test(input.color),
      "INVALID_JOB",
      "Invalid public seat appearance",
    );
    const key = digest(input.seatId),
      fingerprint = digest(
        JSON.stringify({
          slot: input.slot,
          address: input.address.toLowerCase(),
          base,
          shape: input.shape,
          color: input.color.toLowerCase(),
        }),
      );
    await verifyParty(p);
    let seat = p.seats[key];
    if (seat) {
      requireEns(
        seat.fingerprint === fingerprint,
        "IDEMPOTENCY_CONFLICT",
        "Seat-mint payload changed",
      );
      requireEns(
        !["releasing", "released"].includes(seat.status),
        "SEAT_RELEASED",
        "A released seat identity cannot be reminted",
      );
    } else {
      requireEns(
        !Object.values(p.seats).some(
          (s) =>
            s.status !== "released" &&
            (s.slot === input.slot || same(s.address, input.address)),
        ),
        "SEAT_OCCUPIED",
        "Seat slot or address is already bound",
      );
      const head = await client.getBlock();
      let label;
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = seatLabel(input.nickname, input.slot, attempt);
        if (
          available(
            await read("registry", p.registry, "getState", [
              labelId(candidate),
            ]),
            head.timestamp,
          )
        ) {
          label = candidate;
          break;
        }
      }
      requireEns(label, "COLLISION_LIMIT", "No seat label is available");
      seat = {
        fingerprint,
        label,
        name: `${label}.${p.name}`,
        address: input.address,
        slot: input.slot,
        status: "minting",
        appearance: `slot=${input.slot};shape=${input.shape};color=${input.color.toLowerCase()}`,
      };
      p.seats[key] = seat;
      await save();
    }
    const current = await read("registry", p.registry, "getState", [
      labelId(seat.label),
    ]);
    if (available(current, (await client.getBlock()).timestamp)) {
      requireEns(
        seat.status === "minting" && !seat.resource,
        "SEAT_CHANGED",
        "A revoked seat must not be silently reminted",
      );
      await send(
        `seat:${digest(input.partyId)}:${key}:register`,
        "registry",
        p.registry,
        "register",
        [
          seat.label,
          seat.address,
          zeroAddress,
          p.resolver,
          0n,
          BigInt(p.expiresAt),
        ],
      );
    }
    const s = await read("registry", p.registry, "getState", [
      labelId(seat.label),
    ]);
    requireEns(
      s.status === protocol.registeredStatus &&
        same(s.latestOwner, seat.address) &&
        s.expiry === BigInt(p.expiresAt),
      "SEAT_CHANGED",
      "Seat ownership or expiry changed",
    );
    requireEns(
      !seat.resource || seat.resource === String(s.resource),
      "SEAT_CHANGED",
      "Seat registration generation changed",
    );
    requireEns(
      same(
        await read("registry", p.registry, "getResolver", [seat.label]),
        p.resolver,
      ) &&
        same(
          await read("registry", p.registry, "getSubregistry", [seat.label]),
          zeroAddress,
        ),
      "SEAT_CHANGED",
      "Seat links changed",
    );
    requireEns(
      ((await read("registry", p.registry, "roles", [
        labelId(seat.label),
        seat.address,
      ])) &
        ~(protocol.hostRoles?.kick || 0n)) ===
        0n,
      "SEAT_CHANGED",
      "Seat must remain soulbound without registry roles",
    );
    seat.resource = String(s.resource);
    await save();
    if (seat.status !== "ready")
      await send(
        `seat:${digest(input.partyId)}:${key}:records`,
        "resolver",
        p.resolver,
        "multicall",
        [
          [
            addressCall(seat.name, seat.address),
            ...textCalls(seat.name, { "chonks.seat": seat.appearance }),
          ],
        ],
      );
    requireEns(
      same(await readRecord(client, p.resolver, seat.name), seat.address) &&
        (await readRecord(client, p.resolver, seat.name, "chonks.seat")) ===
          seat.appearance,
      "RECORD_MISMATCH",
      "Seat records did not read back",
    );
    seat.status = "ready";
    await save();
    return {
      name: seat.name,
      address: seat.address,
      slot: seat.slot,
      expiresAt: p.expiresAt,
      status: seat.status,
    };
  }
  async function release(partyId, seatId) {
    const p = getParty(partyId);
    requireEns(identifier(seatId), "INVALID_JOB", "Invalid seat ID");
    const seat = p.seats[digest(seatId)];
    requireEns(seat, "SEAT_UNKNOWN", "Seat was not minted by this adapter");
    if (seat.status === "released") return { status: "released" };
    for (const g of Object.values(p.grants || {}))
      if (same(g.address, seat.address) && g.status !== "revoked")
        await revoke({ partyId, grantId: g.id, address: g.address });
    const s = await read("registry", p.registry, "getState", [
      labelId(seat.label),
    ]);
    const time = (await client.getBlock()).timestamp;
    const active = s.status === protocol.registeredStatus && s.expiry > time;
    requireEns(
      seat.resource && (active || available(s, time)),
      "SEAT_CHANGED",
      "Refusing to release an unreconciled or reserved seat registration",
    );
    if (s.status === protocol.registeredStatus)
      requireEns(
        same(s.latestOwner, seat.address) &&
          seat.resource === String(s.resource),
        "SEAT_CHANGED",
        "Refusing to release a different seat registration",
      );
    const resolved = await readRecord(client, p.resolver, seat.name);
    requireEns(
      same(resolved, seat.address) || same(resolved, zeroAddress),
      "SEAT_CHANGED",
      "Refusing to clear another seat's address record",
    );
    seat.status = "releasing";
    await save();
    // Unregister alone does not erase resolver bundles. Clear even when a host
    // already unregistered the seat, otherwise wildcard resolution retains addr.
    await send(
      `seat:${digest(partyId)}:${digest(seatId)}:clear`,
      "resolver",
      p.resolver,
      "multicall",
      [
        [
          addressCall(seat.name, zeroAddress),
          ...textCalls(seat.name, { "chonks.seat": "", "chonks.last": "" }),
        ],
      ],
    );
    requireEns(
      same(await readRecord(client, p.resolver, seat.name), zeroAddress),
      "RECORD_MISMATCH",
      "Seat address did not clear",
    );
    if (active) {
      await send(
        `seat:${digest(partyId)}:${digest(seatId)}:release`,
        "registry",
        p.registry,
        "unregister",
        [labelId(seat.label)],
      );
      const after = await read("registry", p.registry, "getState", [
        labelId(seat.label),
      ]);
      requireEns(
        after.status !== protocol.registeredStatus,
        "SEAT_CHANGED",
        "Seat still registered after release",
      );
    }
    seat.status = "released";
    await save();
    return { status: "released" };
  }
  async function end(partyId) {
    const p = getParty(partyId);
    if (p.status === "ended") return { status: "ended" };
    for (const g of Object.values(p.grants || {}))
      if (g.status !== "revoked")
        await revoke({ partyId, grantId: g.id, address: g.address });
    const proof = await play(),
      head = await client.getBlock();
    const s = await read("registry", proof.leaf.subregistry, "getState", [
      labelId(p.label),
    ]);
    if (s.status === protocol.registeredStatus && s.expiry > head.timestamp) {
      await verifyParty(p);
      p.status = "ending";
      await save();
      await send(
        `party:${digest(partyId)}:end`,
        "registry",
        proof.leaf.subregistry,
        "unregister",
        [labelId(p.label)],
      );
      requireEns(
        (
          await read("registry", proof.leaf.subregistry, "getState", [
            labelId(p.label),
          ])
        ).status !== protocol.registeredStatus,
        "PARTY_CHANGED",
        "Party still registered after end",
      );
    }
    p.status = "ended";
    await save();
    return { status: "ended" };
  }
  async function scope(p) {
    requireEns(
      protocol.hostRoles?.control > 0n && protocol.hostRoles?.kick > 0n,
      "INVALID_CONFIG",
      "Pinned host role bitmaps are required",
    );
    const setter = textCalls(p.name, { "chonks.control": "" })[0];
    const [, resource, bitmap] = await read(
      "resolver",
      p.resolver,
      "decodeSetter",
      [setter],
    );
    requireEns(
      bitmap === protocol.hostRoles.control && resource !== 0n,
      "DEPLOYMENT_DRIFT",
      "Resolver control scope differs from the pinned protocol",
    );
    return { setter, resource, bitmap };
  }
  async function grant(input) {
    const p = getParty(input?.partyId);
    requireEns(
      identifier(input.grantId) &&
        address(input.address) &&
        !same(input.address, owner),
      "INVALID_JOB",
      "Invalid delegated host identity",
    );
    requireEns(
      p.status === "ready",
      "PARTY_NOT_READY",
      "Party is not ready for a host",
    );
    await verifyParty(p);
    p.grants ||= {};
    const key = digest(input.grantId);
    let g = p.grants[key];
    if (g)
      requireEns(
        same(g.address, input.address) &&
          ["granting", "granted"].includes(g.status),
        "GRANT_CHANGED",
        "An old host grant cannot be restored",
      );
    else {
      requireEns(
        !Object.values(p.grants).some((g) => g.status !== "revoked"),
        "HOST_OCCUPIED",
        "Revoke the previous host before granting another",
      );
    }
    // Recheck on resumed grants too: a crash does not preserve seat authority.
    const seat = Object.values(p.seats).find(
      (s) => s.status === "ready" && same(s.address, input.address),
    );
    requireEns(seat, "SEAT_UNKNOWN", "Host must own a current phone seat");
    const s = await read("registry", p.registry, "getState", [
      labelId(seat.label),
    ]);
    requireEns(
      s.status === protocol.registeredStatus &&
        same(s.latestOwner, input.address) &&
        seat.resource === String(s.resource) &&
        s.expiry > (await client.getBlock()).timestamp,
      "SEAT_CHANGED",
      "Host seat changed on chain",
    );
    if (!g) {
      g = { id: input.grantId, address: input.address, status: "granting" };
      p.grants[key] = g;
      await save();
    }
    const { setter, resource, bitmap } = await scope(p),
      prefix = `grant:${digest(input.partyId)}:${key}`;
    if (g.status !== "granted") {
      await send(`${prefix}:kick`, "registry", p.registry, "grantRootRoles", [
        protocol.hostRoles.kick,
        g.address,
      ]);
      await send(
        `${prefix}:control`,
        "resolver",
        p.resolver,
        "grantSetterRoles",
        [setter, g.address],
      );
      await send(`${prefix}:record`, "resolver", p.resolver, "multicall", [
        textCalls(p.name, { "chonks.host": g.address }),
      ]);
    }
    requireEns(
      (await read("registry", p.registry, "hasRootRoles", [
        protocol.hostRoles.kick,
        g.address,
      ])) &&
        (await read("resolver", p.resolver, "hasRoles", [
          resource,
          bitmap,
          g.address,
        ])) &&
        same(
          await readRecord(client, p.resolver, p.name, "chonks.host"),
          g.address,
        ),
      "ROLE_CHANGED",
      "Delegated host roles did not read back",
    );
    g.status = "granted";
    await save();
    return { grantId: g.id, address: g.address, status: g.status };
  }
  async function revoke(input) {
    const p = getParty(input?.partyId);
    requireEns(
      identifier(input.grantId) &&
        address(input.address) &&
        !same(input.address, owner),
      "INVALID_JOB",
      "Invalid host revoke",
    );
    p.grants ||= {};
    const key = digest(input.grantId);
    let g = p.grants[key];
    if (!g) {
      g = { id: input.grantId, address: input.address, status: "revoked" };
      p.grants[key] = g;
      await save();
    }
    requireEns(
      same(g.address, input.address),
      "GRANT_CHANGED",
      "Host revoke address changed",
    );
    if (g.status === "revoked")
      return { grantId: g.id, address: g.address, status: g.status };
    g.status = "revoking";
    await save();
    const { resource, bitmap } = await scope(p),
      prefix = `revoke:${digest(input.partyId)}:${key}`;
    if (
      same(
        await readRecord(client, p.resolver, p.name, "chonks.host"),
        g.address,
      )
    )
      await send(`${prefix}:record`, "resolver", p.resolver, "multicall", [
        textCalls(p.name, { "chonks.host": "" }),
      ]);
    await send(`${prefix}:control`, "resolver", p.resolver, "revokeRoles", [
      resource,
      bitmap,
      g.address,
    ]);
    await send(`${prefix}:kick`, "registry", p.registry, "revokeRootRoles", [
      protocol.hostRoles.kick,
      g.address,
    ]);
    requireEns(
      !(await read("registry", p.registry, "hasRootRoles", [
        protocol.hostRoles.kick,
        g.address,
      ])) &&
        !(await read("resolver", p.resolver, "hasRoles", [
          resource,
          bitmap,
          g.address,
        ])),
      "ROLE_CHANGED",
      "Host roles remain after revoke",
    );
    g.status = "revoked";
    await save();
    return { grantId: g.id, address: g.address, status: g.status };
  }
  async function records(input) {
    const p = getParty(input?.partyId);
    requireEns(
      identifier(input.changeId) && p.status === "ready",
      "INVALID_JOB",
      "Invalid records job",
    );
    await verifyParty(p);
    const values = input.records || {},
      seats = input.seats || [];
    requireEns(
      values &&
        typeof values === "object" &&
        !Array.isArray(values) &&
        Array.isArray(seats) &&
        seats.length <= 4,
      "INVALID_JOB",
      "Invalid record bundle",
    );
    const validators = {
      "chonks.game": /^chonks\.[a-z0-9-]{1,64}$/,
      "chonks.receipt": /^(0x)?[\da-f]{64}$/,
      "chonks.pot": /^arc:5042002:0x[\da-fA-F]{40}:[\da-fA-Fx]{1,66}$/,
    };
    for (const [key, value] of Object.entries(values))
      requireEns(
        typeof value === "string" && validators[key]?.test(value),
        "INVALID_JOB",
        "Record key or value is not allowed",
      );
    const calls = textCalls(p.name, values);
    for (const value of seats) {
      const seat = p.seats[digest(value.seatId || "")];
      requireEns(
        seat?.status === "ready" &&
          typeof value.last === "string" &&
          /^[a-zA-Z0-9:_.-]{1,100}:(0x)?[\da-f]{64}:[1-4]$/.test(value.last),
        "INVALID_JOB",
        "Invalid seat result record",
      );
      calls.push(...textCalls(seat.name, { "chonks.last": value.last }));
    }
    requireEns(
      calls.length > 0 && calls.length <= 7,
      "INVALID_JOB",
      "Record bundle must contain one to seven values",
    );
    const key = digest(input.changeId),
      fingerprint = digest(JSON.stringify({ values, seats }));
    p.changes ||= {};
    requireEns(
      !p.changes[key] || p.changes[key] === fingerprint,
      "IDEMPOTENCY_CONFLICT",
      "Record payload changed",
    );
    p.changes[key] = fingerprint;
    await save();
    await send(
      `record:${digest(input.partyId)}:${key}`,
      "resolver",
      p.resolver,
      "multicall",
      [calls],
    );
    // Receipt reconciliation proves this immutable change even if a later job
    // has legitimately overwritten a latest-value record.
    return { changeId: input.changeId, status: "written" };
  }
  return {
    hasGrant: (partyId, grantId) =>
      serialize(() => {
        requireEns(
          identifier(partyId) && identifier(grantId),
          "INVALID_JOB",
          "Invalid grant state lookup",
        );
        return !!state.parties[digest(partyId)]?.grants?.[digest(grantId)];
      }),
    refill: () => serialize(refill),
    open: (input) => serialize(() => open(input)),
    mint: (input) => serialize(() => mint(input)),
    release: (p, s) => serialize(() => release(p, s)),
    end: (p) => serialize(() => end(p)),
    grant: (input) => serialize(() => grant(input)),
    revoke: (input) => serialize(() => revoke(input)),
    records: (input) => serialize(() => records(input)),
    async close() {
      if (closed) return;
      closed = true;
      await tail;
      await unlock();
    },
  };
}
