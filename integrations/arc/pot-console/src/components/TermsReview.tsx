import { formatUsdc } from "@/onchain-money";
import { zeroAddress } from "viem";
import { formatChainTime, formatDuration } from "../lib/pot";
import type { ValidTerms } from "../lib/createForm";
import { Field, XpWindow } from "./XpWindow";

const RULE_TEXT = {
  WINNER_TAKES_ALL: "Winner takes all",
  TOP2_70_30: "Top two 70/30",
  EQUAL_AMONG_TOP: "Equal among top",
} as const;

/** Every term exactly as it will be sent, plus the canonical hash each seat will sign. */
export function TermsReview({ value }: { value: ValidTerms }) {
  const t = value.terms;
  return (
    <XpWindow title="Review the exact terms" testId="terms-review">
      <dl className="grid grid-cols-1 gap-3">
        <Field label="Pot id">
          <span className="mono break-all text-xs" data-testid="review-pot-id">
            {t.potId}
          </span>
        </Field>
        <Field label="Token">
          {value.assetLabel}{" "}
          <span className="mono break-all text-xs">{t.asset}</span>
        </Field>
        <Field label="Stake per seat">
          <span data-testid="review-stake">{formatUsdc(t.stake)}</span>{" "}
          {value.assetLabel}{" "}
          <span className="text-xs text-[var(--subtle)]">
            ({t.stake.toString()} base units)
          </span>
        </Field>
        <Field label="Whole pot">
          <span data-testid="review-total">{formatUsdc(value.total)}</span>{" "}
          {value.assetLabel}{" "}
          <span className="text-xs text-[var(--subtle)]">
            ({value.total.toString()} base units)
          </span>
        </Field>
        <Field label="Seats, in order">
          <ol className="list-decimal pl-5">
            {t.seats.map((seat) => (
              <li key={seat}>
                <span className="mono break-all text-xs">{seat}</span>
              </li>
            ))}
          </ol>
        </Field>
        <Field label="Payout rule">{RULE_TEXT[t.rule]}</Field>
        <Field label="Oracle">
          {t.oracle === zeroAddress ? (
            "None"
          ) : (
            <span className="mono break-all text-xs">{t.oracle}</span>
          )}
        </Field>
        <Field label="Funding deadline">
          {formatChainTime(t.fundDeadline)}{" "}
          <span className="text-xs text-[var(--subtle)]">
            ({t.fundDeadline.toString()})
          </span>
        </Field>
        <Field label="Settle deadline">
          {formatChainTime(t.settleDeadline)}{" "}
          <span className="text-xs text-[var(--subtle)]">
            ({t.settleDeadline.toString()})
          </span>
        </Field>
        <Field label="Challenge window">
          {formatDuration(t.challengeWindow)}
        </Field>
        <Field label="Minimum play time">
          {formatDuration(t.minPlaySeconds)}
        </Field>
        <Field label="Off-chain terms hash">
          <span className="mono break-all text-xs">{t.metadataHash}</span>
        </Field>
        <Field label="Canonical terms hash (computed here)">
          <span
            className="mono break-all text-xs"
            data-testid="review-terms-hash"
          >
            {value.termsHash}
          </span>
        </Field>
      </dl>
      <p className="mt-3 text-xs text-pretty text-[var(--subtle)]">
        The contract recomputes this hash itself when the pot is created and
        stores only its own result. Seats sign that hash, so any difference
        between these terms and the stored ones makes their signatures fail.
      </p>
    </XpWindow>
  );
}
