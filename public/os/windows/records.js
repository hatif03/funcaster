import { h } from "../util/h.js";
import { recentRecords, verificationText } from "../window-data.js";
import { WINDOW_CONTENT_STRINGS as S } from "../strings.js";
import { utility, button, note, saveRecord } from "./utility.js";
import { mountHistory } from "./ens-history.js";
export function open(ctx) {
  const page = utility(ctx, S.recordsIntro),
    list = h("ul", { class: "os-record-list" });
  let signature = "",
    controls = [];
  const history = mountHistory();
  page.content.append(history.el, list, note(S.recordExpired));
  function update(state) {
    history.update(state);
    const records = recentRecords(
        ctx.storage,
        state.room?.code || state.identity?.code || "",
      ),
      key = JSON.stringify(records);
    if (key !== signature) {
      signature = key;
      controls = [];
      list.replaceChildren(
        ...(records.length
          ? records.map((record) => {
              const save = button(`save-${record.matchId}`, S.save, () =>
                page.run(
                  save,
                  () => saveRecord(ctx, record.matchId),
                  () => page.report(S.saved),
                ),
              );
              controls.push(save);
              return h(
                "li",
                { class: "os-record-row" },
                h(
                  "div",
                  {},
                  h("strong", { text: record.title }),
                  h("span", {
                    class: "os-status-chip",
                    text: verificationText(record.verification),
                  }),
                ),
                save,
              );
            })
          : [h("li", { text: S.noRecords })]),
      );
    }
    controls.forEach((control) =>
      page.enabled(control, state.connection === "connected" && !ctx.demo),
    );
  }
  page.refresh = () => update(ctx.store.get());
  page.refresh();
  return {
    el: page.el,
    update,
    destroy() {
      history.destroy();
      page.destroy();
    },
  };
}
