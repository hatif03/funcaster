import { h } from "../util/h.js";
import { button, note, section } from "./utility.js";
import { ENS_STRINGS as S } from "../strings.js";
import { safeWebUrl } from "../window-data.js";
export function mountHistory() {
  const status = note(""),
    list = h("ul", { class: "os-record-list" });
  status.setAttribute("role", "status");
  const load = button("chain-history", S.historyLoad, () => read()),
    more = button("chain-history-more", S.historyMore, () => read(cursor), {
      hidden: true,
    }),
    title = note(""),
    el = section(S.historyTitle, title, load, status, list, more);
  let party,
    cursor,
    busy = false,
    generation = 0,
    controller;
  el.hidden = true;
  title.style.overflowWrap = "anywhere";
  async function read(next) {
    if (busy || !party) return;
    const attempt = ++generation;
    busy = true;
    load.disabled = more.disabled = true;
    status.textContent = S.historyLoading;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const query = new URLSearchParams({
        name: party.name,
        tx: party.registrationTx,
      });
      if (next) query.set("cursor", next);
      const response = await fetch(`/api/web3/ens/history?${query}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw Error("Unavailable");
      const data = await response.json();
      if (attempt !== generation) return;
      const explorer = safeWebUrl(data.explorer);
      if (!next) list.replaceChildren();
      for (const row of data.rows) {
        if (
          !/^(0x)?[\da-f]{64}$/i.test(row.resultHash) ||
          !/^0x[\da-f]{64}$/i.test(row.tx)
        )
          continue;
        const hash = h("code", { text: row.resultHash });
        hash.style.overflowWrap = "anywhere";
        hash.style.display = "block";
        list.append(
          h(
            "li",
            { class: "os-record-row" },
            h("div", {}, hash, h("span", { text: S.block(row.blockNumber) })),
            explorer &&
              h("a", {
                class: "xp-button",
                text: S.transaction,
                href: new URL(`/tx/${row.tx}`, explorer).href,
                target: "_blank",
                rel: "noopener noreferrer",
                dataset: { nav: "", id: `history-${row.tx}-${row.logIndex}` },
              }),
          ),
        );
      }
      cursor = data.nextCursor;
      more.hidden = !cursor;
      status.textContent = data.rows.length ? S.historySource : S.historyEmpty;
    } catch {
      if (attempt === generation) status.textContent = S.historyError;
    } finally {
      clearTimeout(timeout);
      if (attempt === generation) {
        busy = false;
        load.disabled = more.disabled = false;
      }
    }
  }
  return {
    el,
    update(state) {
      const current = state.room?.web3?.party;
      if (state.room?.web3?.mode !== "on" || !current?.registrationTx) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      if (party?.registrationTx !== current.registrationTx) {
        generation++;
        controller?.abort();
        busy = false;
        party = current;
        cursor = null;
        list.replaceChildren();
        more.hidden = true;
        load.disabled = false;
        status.textContent = "";
        title.textContent = current.name;
      }
    },
    destroy() {
      generation++;
      controller?.abort();
    },
  };
}
