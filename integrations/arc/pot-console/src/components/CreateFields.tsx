import type { ReactNode } from "react";
import { Dices } from "lucide-react";
import type { ChonksConfig } from "../config";
import {
  MAX_SEATS,
  type CreateFormValues,
  type FormErrors,
} from "../lib/createForm";
import { RULES } from "../lib/signing";
import { formatChainTime } from "../lib/pot";
import { XpWindow } from "./XpWindow";

type TextKey = Exclude<keyof CreateFormValues, "seats" | "noOracle">;

const INPUT =
  "min-h-11 w-full min-w-0 rounded-lg border border-[var(--border-strong)] bg-[#0a1424] px-3 text-base text-[var(--ink)] placeholder:text-[var(--subtle)]";

function Row({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-[var(--ink-2)]">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-pretty text-[var(--subtle)]">{hint}</p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-[var(--danger)]"
          data-testid={`${id}-error`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function utc(raw: string): string | undefined {
  return /^\d{1,15}$/.test(raw.trim())
    ? formatChainTime(BigInt(raw.trim()))
    : undefined;
}

interface CreateFieldsProps {
  values: CreateFormValues;
  errors: FormErrors;
  config: ChonksConfig;
  onChange: (patch: Partial<CreateFormValues>) => void;
  onSeat: (index: number, value: string) => void;
  onGenerate: () => void;
}

export function CreateFields({
  values,
  errors,
  config,
  onChange,
  onSeat,
  onGenerate,
}: CreateFieldsProps) {
  const text = (
    key: TextKey,
    id: string,
    extra?: { mono?: boolean; numeric?: boolean; placeholder?: string },
  ) => (
    <input
      id={id}
      value={values[key]}
      onChange={(event) => onChange({ [key]: event.target.value })}
      inputMode={
        key === "stake" ? "decimal" : extra?.numeric ? "numeric" : "text"
      }
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      placeholder={extra?.placeholder}
      aria-invalid={Boolean(errors[key as keyof FormErrors])}
      aria-describedby={
        errors[key as keyof FormErrors] ? `${id}-error` : undefined
      }
      className={`${INPUT} ${extra?.mono ? "mono" : ""}`}
    />
  );

  return (
    <>
      <XpWindow title="1 · Pot and token">
        <div className="flex flex-col gap-3">
          <Row
            id="potId"
            label="Pot id (32 bytes)"
            error={errors.potId}
            hint="Must be unused. Generate a random one, or paste your own."
          >
            {text("potId", "potId", { mono: true, placeholder: "0x…" })}
            <button
              type="button"
              className="xp-btn xp-btn-ghost w-full sm:w-fit"
              onClick={onGenerate}
              data-testid="generate-id"
            >
              <Dices aria-hidden="true" className="h-4 w-4" />
              Generate
            </button>
          </Row>
          <Row
            id="asset"
            label="Token"
            error={errors.asset}
            hint="Both use 6 decimals. The contract only accepts the tokens it was deployed with."
          >
            <select
              id="asset"
              value={values.asset}
              onChange={(event) =>
                onChange({
                  asset: event.target.value as CreateFormValues["asset"],
                })
              }
              className={INPUT}
              aria-invalid={Boolean(errors.asset)}
            >
              <option value="">Choose…</option>
              <option value="usdc">
                USDC · {config.usdcAddress.slice(0, 8)}…
              </option>
              <option value="eurc" disabled={!config.eurcAddress}>
                EURC
                {config.eurcAddress
                  ? ` · ${config.eurcAddress.slice(0, 8)}…`
                  : " (not configured)"}
              </option>
            </select>
          </Row>
          <Row
            id="stake"
            label="Stake per seat"
            error={errors.stake}
            hint="Exact decimal, at most 6 places, for example 1.5. Nothing is rounded."
          >
            {text("stake", "stake", { numeric: true, placeholder: "0.000000" })}
          </Row>
        </div>
      </XpWindow>

      <XpWindow title="2 · Seats and rule">
        <div className="flex flex-col gap-3">
          {Array.from({ length: MAX_SEATS }, (_, i) => (
            <Row
              key={i}
              id={`seat-${i}`}
              label={`Seat ${i + 1}${i < 2 ? "" : " (optional)"}`}
            >
              <input
                id={`seat-${i}`}
                value={values.seats[i] ?? ""}
                onChange={(event) => onSeat(i, event.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="0x…"
                className={`${INPUT} mono`}
                aria-invalid={Boolean(errors.seats)}
              />
            </Row>
          ))}
          {errors.seats ? (
            <p
              role="alert"
              className="text-sm text-[var(--danger)]"
              data-testid="seats-error"
            >
              {errors.seats}
            </p>
          ) : (
            <p className="text-xs text-[var(--subtle)]">
              Seat order matters: it is part of what each seat signs and decides
              the remainder.
            </p>
          )}
          <Row id="rule" label="Payout rule" error={errors.rule}>
            <select
              id="rule"
              value={values.rule}
              onChange={(event) =>
                onChange({
                  rule: event.target.value as CreateFormValues["rule"],
                })
              }
              className={INPUT}
              aria-invalid={Boolean(errors.rule)}
            >
              <option value="">Choose…</option>
              {RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {rule === "WINNER_TAKES_ALL"
                    ? "Winner takes all"
                    : rule === "TOP2_70_30"
                      ? "Top two 70/30"
                      : "Equal among top"}
                </option>
              ))}
            </select>
          </Row>
          <Row
            id="oracle"
            label="Oracle address"
            error={errors.oracle}
            hint="An oracle can only propose a result; any seat can contest it."
          >
            {text("oracle", "oracle", { mono: true, placeholder: "0x…" })}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.noOracle}
                onChange={(event) =>
                  onChange({ noOracle: event.target.checked })
                }
                className="h-5 w-5"
              />
              No oracle (unanimous settlement or refund only)
            </label>
          </Row>
        </div>
      </XpWindow>

      <XpWindow title="3 · Timing (all required)">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-pretty text-[var(--subtle)]">
            Deadlines are Unix seconds (chain time). There are no defaults:
            choose every value deliberately.
          </p>
          <Row
            id="fundDeadline"
            label="Funding deadline"
            error={errors.fundDeadline}
            hint={utc(values.fundDeadline)}
          >
            {text("fundDeadline", "fundDeadline", { numeric: true })}
          </Row>
          <Row
            id="settleDeadline"
            label="Settle deadline"
            error={errors.settleDeadline}
            hint={utc(values.settleDeadline)}
          >
            {text("settleDeadline", "settleDeadline", { numeric: true })}
          </Row>
          <Row
            id="challengeWindow"
            label="Challenge window (seconds, at least 60)"
            error={errors.challengeWindow}
          >
            {text("challengeWindow", "challengeWindow", { numeric: true })}
          </Row>
          <Row
            id="minPlaySeconds"
            label="Minimum play time (seconds, above 0)"
            error={errors.minPlaySeconds}
          >
            {text("minPlaySeconds", "minPlaySeconds", { numeric: true })}
          </Row>
        </div>
      </XpWindow>

      <XpWindow title="4 · Off-chain terms">
        <Row
          id="metadataHash"
          label="Off-chain terms hash (32 bytes)"
          error={errors.metadataHash}
          hint="A commitment to the game rules or rulebook version. Use all zeros only if there are none."
        >
          {text("metadataHash", "metadataHash", {
            mono: true,
            placeholder: "0x…",
          })}
        </Row>
      </XpWindow>
    </>
  );
}
