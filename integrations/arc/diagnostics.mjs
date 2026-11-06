// Public diagnostics are enums only. RPC errors may contain credentials,
// signed calldata or request bodies; never serialize messages or stacks.
import { ARC_READ_METHODS } from "./rpc.mjs";
const phases = new Set([
  "provider-config",
  "provider-preflight",
  "provider-relayer-journal",
  "provider-oracle-journal",
  "provider-drip-budget",
  "provider-lifecycle",
  "preflight-deployment",
  "preflight-usdc",
  "preflight-eurc",
  "preflight-balances",
  "preflight-constants",
  "preflight-terms",
  "preflight-simulation",
  "preflight-gas",
  "preflight-canonical",
  "fixture-accounts",
  "worker-scenario",
]);
const codes = new Set([
  "INVALID_CONFIG",
  "INVALID_JOB",
  "INVALID_PROOF",
  "INVALID_RECEIPT",
  "PREFLIGHT_FAILED",
  "WRONG_CHAIN",
  "WRONG_SIGNER",
  "WRONG_SIGNATURE",
  "STATE_CONFLICT",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RECEIPT_MISMATCH",
  "BUDGET_EXCEEDED",
  "NONCE_CONFLICT",
  "REVERTED",
  "KILLED",
  "CLOSED",
  "ACCEPTANCE_STEP_FAILED",
  "ACCEPTANCE_STEP_PENDING",
  "ACCEPTANCE_RECOVERY_PENDING",
  "ACCEPTANCE_WRONG_OUTCOME",
  "RECOVERY_WAIT",
  "RECOVERY_ALREADY_ATTEMPTED",
  "RECOVERY_SEND_UNCERTAIN",
  "ENOENT",
  "EACCES",
  "EPERM",
  "EEXIST",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "ERR_ASSERTION",
  "INSUFFICIENT_BALANCE",
  "RATE_LIMIT",
  "RECIPIENT_BLOCKED",
  "RPC_UNAVAILABLE",
  "TOO_EARLY",
  "UNAVAILABLE",
  "UNRESOLVED",
]);
const names = new Set([
  "Error",
  "TypeError",
  "AssertionError",
  "SyntaxError",
  "BaseError",
  "HttpRequestError",
  "TimeoutError",
  "ConnectTimeoutError",
  "SocketError",
  "RpcRequestError",
  "UnknownRpcError",
  "InternalRpcError",
  "LimitExceededRpcError",
  "ContractFunctionExecutionError",
  "ContractFunctionRevertedError",
  "CallExecutionError",
  "EstimateGasExecutionError",
  "TransactionReceiptNotFoundError",
  "TransactionNotFoundError",
]);
const recoveryChecks = new Set([
  "txChain",
  "txHash",
  "receiptHash",
  "sender",
  "destination",
  "calldata",
  "nonce",
  "value",
  "gas",
  "maxFee",
  "priorityFee",
  "txBlock",
  "receiptBlock",
  "blockNumber",
  "positiveGas",
  "gasCeiling",
  "positivePrice",
  "priceCeiling",
]);
const messages = new Map([
  ["Arc read is stale", "STALE_READ"],
  ["Arc RPC chain mismatch", "WRONG_CHAIN"],
  ["Arc read changed chain or block", "INVALID_PROOF"],
  ["Arc deployment code or asset allowlist differs", "INVALID_PROOF"],
  ["Another worker already owns this volume", "WORKER_BUSY"],
  ["Worker lock needs inspection", "WORKER_LOCK_INVALID"],
  ["Unable to acquire worker lock", "WORKER_BUSY"],
]);
export async function withArcPhase(phase, operation) {
  if (!phases.has(phase)) throw Error("Unknown diagnostic phase");
  try {
    return await operation();
  } catch (error) {
    // Preserve the innermost known phase and original cause for classification.
    if (error && typeof error === "object" && Object.isExtensible(error)) {
      if (!phases.has(error.arcPhase)) error.arcPhase = phase;
      throw error;
    }
    throw Object.assign(Error("Arc operation failed", { cause: error }), {
      arcPhase: phase,
    });
  }
}
export function arcFailure(error) {
  const causes = [];
  let phase, code, method, attempts;
  for (let e = error, depth = 0; e && depth < 12; e = e.cause, depth++) {
    if (!phase && phases.has(e.arcPhase)) phase = e.arcPhase;
    if (!method && ARC_READ_METHODS.has(e.arcRpcMethod)) {
      method = e.arcRpcMethod;
      if (
        Number.isInteger(e.arcRpcAttempts) &&
        e.arcRpcAttempts >= 1 &&
        e.arcRpcAttempts <= 4
      )
        attempts = e.arcRpcAttempts;
    }
    const known =
      (e.code === -32005 || e.status === 429
        ? "RPC_RATE_LIMITED"
        : undefined) ||
      messages.get(e.message) ||
      (codes.has(e.code) ? e.code : undefined);
    code ||= known;
    causes.push({
      name: names.has(e.name) ? e.name : "UnknownError",
      ...(known
        ? { code: known }
        : Number.isSafeInteger(e.code) && e.code >= -32768 && e.code <= -32000
          ? { rpcCode: e.code }
          : {}),
    });
  }
  const step = error?.step;
  const failedChecks = Array.isArray(error?.recoveryChecks)
    ? [...new Set(error.recoveryChecks.filter((c) => recoveryChecks.has(c)))]
    : [];
  return {
    code: code || "UNAVAILABLE",
    ...(phase ? { phase } : {}),
    ...(method ? { method, ...(attempts ? { attempts } : {}) } : {}),
    ...(typeof step === "string" && /^arc\.(pot\.)?[a-z]+$/.test(step)
      ? { step }
      : {}),
    ...(failedChecks.length ? { recoveryChecks: failedChecks } : {}),
    causes,
  };
}
