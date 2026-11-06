import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import type { ChonksConfig } from "../config";
import { formatUsdcUnits, shortenAddress } from "../lib/format";
import {
  RULE_LABELS,
  assetLabel,
  formatChainTime,
  formatDuration,
  hasOracle,
  secondsUntil,
  type PotSnapshot,
} from "../lib/pot";
import { Field, XpWindow } from "./XpWindow";

const STATE_TONE: Record<PotSnapshot["state"], string> = {
  None: "text-[var(--muted)]",
  Funding: "text-[var(--warn)]",
  Locked: "text-[var(--accent)]",
  Proposed: "text-[var(--warn)]",
  Contested: "text-[var(--danger)]",
  Settled: "text-[var(--success)]",
  Refunded: "text-[var(--muted)]",
};

const STATE_COPY: Record<PotSnapshot["state"], string> = {
  None: "This pot does not exist.",
  Funding: "Waiting for every seat to pay in.",
  Locked: "Every stake is in. Waiting for a result.",
  Proposed: "An oracle result is in its challenge window.",
  Contested: "The result was contested. Refund is open.",
  Settled: "Settled. Seats can claim their payout.",
  Refunded: "Refunded. Seats can claim their stake back.",
};

export function PotDetails({
  snapshot,
  config,
  details = false,
}: {
  snapshot: PotSnapshot;
  config: ChonksConfig;
  details?: boolean;
}) {
  const asset = assetLabel(config, snapshot.asset);
  const challengeEnds = snapshot.proposal.at + BigInt(snapshot.challengeWindow);
  const explorer = `${config.explorerBase}/address/${snapshot.contract}`;

  return (
    <>
      {!details && (
        <XpWindow
          title="Pot"
          testId="pot-summary"
          badge={
            <span
              data-testid="pot-state"
              className="rounded-full bg-[#0d1b2f]/70 px-2 py-0.5 text-xs font-bold"
            >
              <span className={clsx(STATE_TONE[snapshot.state])}>
                {snapshot.state}
              </span>
            </span>
          }
        >
          <p
            className="display text-3xl font-bold tabular-nums"
            data-testid="pot-total"
          >
            {formatUsdcUnits(snapshot.total)}{" "}
            <span className="text-base font-medium text-[var(--subtle)]">
              {asset}
            </span>
          </p>
          <p
            className="mt-1 text-sm text-pretty text-[var(--muted)]"
            data-testid="pot-state-copy"
          >
            {STATE_COPY[snapshot.state]}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
            <Field label="Stake per seat" testId="pot-stake">
              {formatUsdcUnits(snapshot.stake)} {asset}
            </Field>
            <Field label="Payout rule">
              {RULE_LABELS[snapshot.rule] ?? `Rule ${snapshot.rule}`}
            </Field>
            <Field label="Seats">{snapshot.seats.length}</Field>
            <Field label="Oracle">
              {hasOracle(snapshot) ? (
                <span className="mono break-all">
                  {shortenAddress(snapshot.oracle, 8, 6)}
                </span>
              ) : (
                "None"
              )}
            </Field>
          </dl>
          {asset === "Unlisted asset" ? (
            <p
              role="note"
              className="mt-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-2 text-xs text-[var(--warn)]"
            >
              This pot uses an asset this console is not configured to name:{" "}
              <span className="mono break-all">{snapshot.asset}</span>
            </p>
          ) : null}
        </XpWindow>
      )}

      {details && (
        <>
          <XpWindow title="Deadlines (chain time)" testId="pot-deadlines">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Funding closes" testId="deadline-fund">
                {formatChainTime(snapshot.fundDeadline)}
                <span className="block text-xs text-[var(--subtle)]">
                  {snapshot.state === "Funding"
                    ? secondsUntil(snapshot, snapshot.fundDeadline) > 0
                      ? `in ${formatDuration(secondsUntil(snapshot, snapshot.fundDeadline))}`
                      : "closed"
                    : ""}
                </span>
              </Field>
              <Field label="Settle by" testId="deadline-settle">
                {formatChainTime(snapshot.settleDeadline)}
                <span className="block text-xs text-[var(--subtle)]">
                  {snapshot.state === "Locked"
                    ? secondsUntil(snapshot, snapshot.settleDeadline) > 0
                      ? `in ${formatDuration(secondsUntil(snapshot, snapshot.settleDeadline))}`
                      : "passed"
                    : ""}
                </span>
              </Field>
              <Field label="Challenge window">
                {formatDuration(snapshot.challengeWindow)}
              </Field>
              <Field label="Minimum play time">
                {formatDuration(snapshot.minPlaySeconds)}
              </Field>
              {snapshot.proposal.at > 0n ? (
                <Field label="Oracle result proposed" testId="proposal-at">
                  {formatChainTime(snapshot.proposal.at)}
                  {snapshot.state === "Proposed" ? (
                    <span className="block text-xs text-[var(--subtle)]">
                      {secondsUntil(snapshot, challengeEnds) > 0
                        ? `contestable for ${formatDuration(secondsUntil(snapshot, challengeEnds))}`
                        : "challenge window over; anyone can finalize"}
                    </span>
                  ) : null}
                </Field>
              ) : null}
            </dl>
            <p className="mt-3 text-xs text-[var(--subtle)]">
              Read at block{" "}
              <span className="tabular-nums">
                {snapshot.blockNumber.toString()}
              </span>
              . Times use that block, not your clock.
            </p>
          </XpWindow>

          <XpWindow title="Contract" testId="pot-contract">
            <dl className="grid grid-cols-1 gap-3">
              <Field label="ConditionalPot">
                <span className="mono break-all text-xs">
                  {snapshot.contract}
                </span>
              </Field>
              <Field label="Asset">
                <span className="mono break-all text-xs">{snapshot.asset}</span>
              </Field>
              <Field label="Terms hash (what each seat signed)">
                <span className="mono break-all text-xs">
                  {snapshot.termsHash}
                </span>
              </Field>
            </dl>
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              View contract on explorer
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
          </XpWindow>
        </>
      )}
    </>
  );
}
