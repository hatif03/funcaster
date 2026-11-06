// ENS retains its existing journal and admission policy on the shared port.
import { createTransactions } from "../shared/transactions.mjs";
export function createEnsTransactions(options) {
  return createTransactions({ ...options, lane: "ens" });
}
