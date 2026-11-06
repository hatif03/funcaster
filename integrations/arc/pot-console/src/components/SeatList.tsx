import { Check, Clock, HandCoins } from "lucide-react";
import clsx from "clsx";
import type { Address } from "viem";
import { formatUsdcUnits, shortenAddress } from "../lib/format";
import { claimOpen, type PotSnapshot } from "../lib/pot";
import { XpWindow } from "./XpWindow";

interface SeatListProps {
  snapshot: PotSnapshot;
  assetName: string;
  /** A transaction is in flight, or no wallet is ready on the configured network. */
  claimDisabled: boolean;
  onClaim: (seat: Address) => void;
}

export function SeatList({
  snapshot,
  assetName,
  claimDisabled,
  onClaim,
}: SeatListProps) {
  const open = claimOpen(snapshot);
  const funded = snapshot.seats.filter((s) => s.funded).length;
  return (
    <XpWindow
      title="Seats"
      testId="seat-list"
      badge={`${funded}/${snapshot.seats.length} funded`}
    >
      <ul className="flex flex-col gap-2">
        {snapshot.seats.map((seat) => {
          const canClaim = open && seat.claimable > 0n;
          return (
            <li
              key={seat.address}
              data-testid={`seat-${seat.index}`}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--subtle)]">
                    Seat {seat.index + 1}
                  </p>
                  <p className="mono break-all text-sm" title={seat.address}>
                    {shortenAddress(seat.address, 8, 6)}
                  </p>
                </div>
                <span
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                    seat.funded
                      ? "border-[var(--success)]/50 bg-[var(--success)]/10 text-[var(--success)]"
                      : "border-[var(--border-strong)] text-[var(--muted)]",
                  )}
                >
                  {seat.funded ? (
                    <Check aria-hidden="true" className="h-3 w-3" />
                  ) : (
                    <Clock aria-hidden="true" className="h-3 w-3" />
                  )}
                  {seat.funded ? "Funded" : "Waiting"}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className="tabular-nums"
                  data-testid={`seat-${seat.index}-claimable`}
                >
                  <span className="display text-xl font-semibold">
                    {open ? formatUsdcUnits(seat.claimable) : "—"}
                  </span>{" "}
                  <span className="text-sm text-[var(--subtle)]">
                    {open ? assetName : "payout after settlement"}
                  </span>
                </p>
                {canClaim ? (
                  <button
                    type="button"
                    className="xp-btn w-full sm:w-auto"
                    disabled={claimDisabled}
                    onClick={() => onClaim(seat.address)}
                    aria-label={`Claim for seat ${seat.index + 1}`}
                  >
                    <HandCoins aria-hidden="true" className="h-4 w-4" />
                    Claim
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-pretty text-[var(--subtle)]">
        Anyone can trigger a claim, but the payout always goes to the seat
        address shown.
      </p>
    </XpWindow>
  );
}
