import { h } from "../util/h.js";
import { utility, button, note, section } from "./utility.js";
export function open(ctx) {
  const page = utility(
      ctx,
      "The arcade, together. Predictions, challenges, records and creators.",
    ),
    mode = note(""),
    prediction = note(""),
    pass = note(""),
    catalog = h("select", {
      "aria-label": "Published creator version",
      dataset: { nav: "", id: "live-version" },
    });
  const links = h("div", { class: "os-utility-actions" });
  for (const [label, href] of [
    ["Funcaster Live", "/live/"],
    ["Predictions & cheers", "/predict"],
    ["Hall & ledger", "/records/"],
    ["Creator Studio", "/commerce/"],
  ])
    links.append(
      h("a", {
        class: "xp-button",
        text: label,
        href,
        target: "_blank",
        rel: "noopener",
        dataset: { nav: "" },
      }),
    );
  const toggle = button("predictions-toggle", "Open predictions", () =>
    page.run(toggle, () =>
      ctx.getSession().predictions({
        listed: !ctx.store.get().room?.web3?.predictions?.listed,
        windowSeconds: 30,
      }),
    ),
  );
  const select = button("commerce-select", "Use this version", () =>
    page.run(select, () =>
      ctx.getSession().commerce({ versionId: catalog.value || null }),
    ),
  );
  const refresh = button("commerce-refresh", "Refresh versions", () =>
    page.run(refresh, load),
  );
  let alive = true,
    versions = [],
    lastGame,
    lastVersion;
  async function load() {
    const response = await fetch("/api/commerce/catalog", {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok)
      return { error: "Creator Studio is disabled on this console." };
    const data = await response.json();
    if (alive) {
      versions = data.versions || [];
      lastGame = null;
      page.refresh();
    }
  }
  page.content.append(
    mode,
    links,
    section(
      "Host: predictions",
      prediction,
      toggle,
      note(
        "The current ready players are locked into the listing. Changing the lineup refunds it. Predictions close before the round starts.",
      ),
    ),
    section(
      "Host: creator passes",
      pass,
      catalog,
      select,
      refresh,
      note(
        "Ordinary games remain free. For a published version, one player opens Creator Studio and chooses a free demo or a pass for the whole table.",
      ),
    ),
  );
  const result = page.finish((state) => {
    const web3 = state.room?.web3,
      p = web3?.predictions,
      c = web3?.commerce;
    mode.textContent = !web3
      ? "Integrations are disabled here."
      : web3.mode === "mock"
        ? "MOCK demo · all new payments are local simulations."
        : "Arc + ENS testnet · local records.";
    prediction.textContent = p?.listed
      ? `Listed · ${p.phase || "waiting"}`
      : p?.enabled
        ? "Two ready phones are needed. Open a 30-second prediction window."
        : "Predictions are disabled or awaiting contract activation.";
    toggle.textContent = p?.listed
      ? "Close and refund listing"
      : "Open predictions";
    page.enabled(
      toggle,
      !!p?.enabled && ["lobby", "results"].includes(state.room?.phase),
    );
    if (lastGame !== state.room?.game) {
      lastGame = state.room?.game;
      catalog.replaceChildren(
        h("option", { value: "", text: "Standard free game" }),
        ...versions
          .filter((v) => v.gameId === lastGame)
          .map((v) =>
            h("option", { value: v.id, text: `${v.title} · ${v.version}` }),
          ),
      );
    }
    if (lastVersion !== (c?.versionId || "")) {
      lastVersion = c?.versionId || "";
      catalog.value = lastVersion;
    }
    pass.textContent = c?.selected
      ? `Selected: ${c.title}. A free demo lasts two minutes.`
      : "Standard free game selected.";
    page.enabled(
      select,
      ["mock", "on"].includes(c?.mode) &&
        ["lobby", "results"].includes(state.room?.phase),
    );
    page.enabled(refresh, !!c && c.mode !== "off");
  });
  void load().catch(() => {});
  return {
    ...result,
    destroy() {
      alive = false;
      page.destroy();
    },
  };
}
