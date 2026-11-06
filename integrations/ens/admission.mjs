// Public RPC replicas may briefly disagree about the nonce immediately after a
// confirmed transaction. Retry only this pre-sign guard, never a broadcast or
// unknown receipt. An unchanged, fully reconciled hash set is required.
export function stableEnsAdmission(
  transactions,
  {
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onWait = () => {},
    attempts = 5,
  } = {},
) {
  return async (id, call) => {
    // The real port reconciles inside transact. Its hash-only snapshot avoids a
    // redundant history read before that same guard; never treat it as proof.
    const before = (
      transactions.admissionHashes
        ? transactions.admissionHashes()
        : (await transactions.receipts()).map((row) => row.hash)
    ).join(",");
    for (let attempt = 0; ; attempt++) {
      try {
        return await transactions.transact(id, call);
      } catch (error) {
        if (error.code !== "NONCE_CONFLICT" || attempt + 1 >= attempts)
          throw error;
        const after = (await transactions.receipts())
          .map((row) => row.hash)
          .join(",");
        if (after !== before) throw error;
        onWait({ waitingForConsistentNonce: true, attempt: attempt + 1 });
        await wait(1500 * (attempt + 1));
      }
    }
  };
}
