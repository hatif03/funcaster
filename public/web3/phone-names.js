import { ENS_STRINGS as S } from "../os/strings.js";
// Optional progressive enhancement. The ordinary room-code handler and the
// synchronous motion-permission tap stay separate from all ENS reads.
export function mountPhoneNames(form, input) {
  const original = form.onsubmit,
    button = form.querySelector("button"),
    label = form.querySelector(`label[for="${input.id}"]`),
    status = form.querySelector("p");
  const intro = status.textContent;
  status.setAttribute("role", "status");
  input.maxLength = 253;
  input.removeAttribute("pattern");
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.placeholder = S.joinPlaceholder;
  label.textContent = S.joinLabel;
  input.style.letterSpacing = "normal";
  input.style.textTransform = "none";
  input.style.fontSize = "clamp(16px, 4vw, 22px)";
  input.style.background = "var(--screen-bg)";
  input.style.color = "var(--screen-ink)";
  input.style.borderColor = "var(--screen-muted)";
  let busy = false;
  form.onsubmit = async (event) => {
    const name = input.value.trim();
    if (!name.includes(".")) {
      status.textContent = intro;
      return original(event);
    }
    event.preventDefault();
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.hidden = false;
    status.textContent = S.checking;
    try {
      const response = await fetch(
        `/api/web3/ens/join?name=${encodeURIComponent(name)}`,
        { signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) throw Error("Lookup unavailable");
      const data = await response.json(),
        url = new URL("/controller", data.origin);
      if (url.protocol !== "https:" || !/^[A-Z0-9]{4,8}$/.test(data.code))
        throw Error("Invalid table");
      url.searchParams.set("room", data.code);
      if (url.origin !== location.origin) {
        location.assign(url.href);
        return;
      }
      input.value = data.code;
      status.hidden = true;
      original(event);
    } catch {
      status.textContent = S.unavailable;
    } finally {
      busy = false;
      button.disabled = false;
    }
  };
}
