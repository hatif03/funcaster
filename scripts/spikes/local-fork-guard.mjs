export function assertLocalFork(url, chainId, clientVersion) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    chainId !== 31337 ||
    !/^anvil\//i.test(clientVersion)
  )
    throw new Error(
      "Refusing mutations: requires localhost Anvil on chain 31337.",
    );
}
