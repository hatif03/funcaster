// A chain denial must never be mistaken for a transport outage (soft fallback).
export class EnsError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "EnsError";
    this.code = code;
  }
}

export function requireEns(condition, code, message) {
  if (!condition) throw new EnsError(code, message);
}
