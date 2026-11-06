import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { parsePotId } from "../lib/pot";
import { XpWindow } from "./XpWindow";

interface PotLookupProps {
  /** Value currently in the URL (may be invalid). Remount with `key={value}` to resync the field. */
  value: string;
  onSubmit: (potId: string) => void;
}

export function PotLookup({ value, onSubmit }: PotLookupProps) {
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);

  const parsed = parsePotId(draft);
  const showError = (touched || value !== "") && draft.trim() !== "" && !parsed;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (parsed) onSubmit(parsed);
  }

  return (
    <XpWindow title="Find a pot" testId="pot-lookup">
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <label htmlFor="pot-id" className="text-sm text-[var(--muted)]">
          Pot id (32-byte hex)
        </label>
        <input
          id="pot-id"
          name="pot"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="0x…"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={showError}
          aria-describedby={showError ? "pot-id-error" : undefined}
          className="mono min-h-11 w-full min-w-0 rounded-lg border border-[var(--border-strong)] bg-[#0a1424] px-3 text-base text-[var(--ink)] placeholder:text-[var(--subtle)]"
        />
        {showError ? (
          <p
            id="pot-id-error"
            role="alert"
            className="text-sm text-[var(--danger)]"
          >
            A pot id is 0x followed by 64 hex characters.
          </p>
        ) : null}
        <button
          type="submit"
          className="xp-btn mt-1 w-full sm:w-fit"
          disabled={!parsed}
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          Load pot
        </button>
      </form>
    </XpWindow>
  );
}
