import { h } from "../util/h.js";
import { WINDOW_CONTENT_STRINGS as S } from "../strings.js";
export const button = (id, text, onclick, props = {}) =>
  h("button", {
    type: "button",
    class: "xp-button",
    text,
    dataset: { nav: "", id },
    onclick,
    ...props,
  });
export const note = (text) => h("p", { class: "os-utility-note", text });
export const section = (title, ...children) =>
  h(
    "section",
    { class: "os-utility-section" },
    h("h2", { text: title }),
    children,
  );
export function checkbox(id, text, change) {
  const input = h("input", {
    type: "checkbox",
    dataset: { nav: "", id },
    onchange: () => change(input.checked),
  });
  return {
    input,
    el: h("label", { class: "os-utility-check" }, input, h("span", { text })),
  };
}
export function utility(ctx, intro) {
  ctx.window.body.classList.add("os-utility-body");
  let alive = true;
  const busy = new Set(),
    content = h("div", { class: "os-utility-content" }),
    footer = h("div", { class: "os-utility-actions" }),
    status = h("p", {
      class: "os-utility-message",
      role: "status",
      hidden: true,
    });
  const el = h(
    "div",
    { class: "os-utility" },
    note(intro),
    content,
    h("div", { class: "os-utility-bottom" }, status, footer),
  );
  const page = {
    el,
    content,
    footer,
    status,
    refresh: () => {},
    enabled(control, value) {
      control.disabled = !value || busy.has(control);
    },
    report(text) {
      if (alive) {
        status.textContent = text || "";
        status.hidden = !text;
      }
    },
    async run(control, fn, success) {
      if (busy.has(control)) return;
      const previouslyDisabled = control.disabled;
      busy.add(control);
      control.disabled = true;
      page.report("");
      try {
        const answer = await fn();
        if (!alive) return;
        if (answer?.error) page.report(answer.error);
        else if (!answer?.cancelled) await success?.(answer);
      } catch {
        page.report(S.error);
      } finally {
        busy.delete(control);
        if (alive) {
          control.disabled = previouslyDisabled;
          page.refresh();
        }
      }
    },
    finish(update) {
      page.refresh = () => update(ctx.store.get());
      page.refresh();
      return { el, update, destroy: page.destroy };
    },
    destroy() {
      alive = false;
    },
  };
  return page;
}
export async function confirm(ctx, title, text, label = S.confirm) {
  return (
    (await ctx.wm.modal({
      title,
      text,
      buttons: [
        { id: "cancel", label: S.cancel },
        { id: "confirm", label },
      ],
      defaultButton: "cancel",
      cancelButton: "cancel",
    })) === "confirm"
  );
}
export async function saveRecord(ctx, matchId) {
  const answer = await ctx.getSession().record(matchId);
  if (answer?.error) return answer;
  if (!answer?.result) return { error: S.error };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(answer, null, 2)], { type: "application/json" }),
  );
  const link = h("a", {
    href: url,
    download: `chonks-${matchId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}.json`,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}
