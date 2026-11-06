import { useCallback } from "react";
import { LoaderCircle, RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { Address, Hex } from "viem";
import type { ChonksConfig } from "../config";
import { usePot, type PotLoadState } from "../hooks/usePot";
import { usePotActions } from "../hooks/usePotActions";
import { usePotParam } from "../hooks/usePotParam";
import { useWallet } from "../hooks/useWallet";
import { assetLabel, readPot, type PotSnapshot } from "../lib/pot";
import { ActionsPanel } from "./ActionsPanel";
import { PotDetails } from "./PotDetails";
import { PotLookup } from "./PotLookup";
import { SeatList } from "./SeatList";

interface PotPageProps {
  config: ChonksConfig;
  /** Injectable for tests; defaults to the public RPC reader. */
  read?: (config: ChonksConfig, potId: Hex) => Promise<PotSnapshot>;
}

function Notice({
  tone,
  icon,
  title,
  children,
  testId,
}: {
  tone: "wait" | "bad" | "empty";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      data-testid={testId}
      className={clsx(
        "flex min-w-0 items-start gap-3 rounded-2xl border p-4",
        tone === "bad" && "border-[var(--danger)]/50 bg-[var(--danger)]/10",
        tone !== "bad" && "border-[var(--border)] bg-[var(--surface)]",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="display text-lg font-semibold">{title}</p>
        <div className="mt-0.5 break-words text-sm text-pretty text-[var(--muted)]">
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({
  state,
}: {
  state: Extract<PotLoadState, { status: "error" }>;
}) {
  const title =
    state.kind === "not-found"
      ? "Pot not found"
      : state.kind === "wrong-chain"
        ? "Wrong chain"
        : state.kind === "config"
          ? "Not configured"
          : state.kind === "not-deployed"
            ? "Not deployed"
            : state.kind === "decimals"
              ? "Unsupported asset"
              : "RPC unavailable";
  return (
    <Notice
      tone="bad"
      testId="pot-error"
      title={title}
      icon={
        state.kind === "not-found" ? (
          <SearchX
            aria-hidden="true"
            className="h-5 w-5 text-[var(--danger)]"
          />
        ) : (
          <TriangleAlert
            aria-hidden="true"
            className="h-5 w-5 text-[var(--danger)]"
          />
        )
      }
    >
      {state.message}
    </Notice>
  );
}

export function PotPage({ config, read = readPot }: PotPageProps) {
  const { raw, potId, setPot } = usePotParam();
  const load = useCallback((id: Hex) => read(config, id), [read, config]);
  const { state, refresh } = usePot(
    load,
    config.potAddress ? potId : undefined,
  );
  const wallet = useWallet(config);
  const actions = usePotActions(config, wallet, refresh);

  const snapshot =
    state.status === "ready"
      ? state.snapshot
      : state.status === "loading"
        ? state.previous
        : undefined;
  const loading = state.status === "loading";
  const invalidParam = raw !== "" && !potId;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {snapshot ? (
        <details className="rounded-xl border border-[var(--border)] px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Change pot
          </summary>
          <div className="pb-3">
            <PotLookup key={raw} value={raw} onSubmit={setPot} />
          </div>
        </details>
      ) : (
        <PotLookup key={raw} value={raw} onSubmit={setPot} />
      )}

      {invalidParam ? (
        <Notice
          tone="bad"
          testId="pot-invalid"
          title="Not a pot id"
          icon={
            <TriangleAlert
              aria-hidden="true"
              className="h-5 w-5 text-[var(--danger)]"
            />
          }
        >
          The link holds <span className="mono break-all">{raw}</span>, which is
          not 0x plus 64 hex characters.
        </Notice>
      ) : null}

      {!raw ? (
        <Notice
          tone="empty"
          testId="pot-empty"
          title="No pot selected"
          icon={
            <SearchX
              aria-hidden="true"
              className="h-5 w-5 text-[var(--accent)]"
            />
          }
        >
          Enter a pot id above, or open a link ending in{" "}
          <span className="mono">?pot=0x…</span>. Pots are read straight from
          the chain, no wallet needed.
        </Notice>
      ) : null}

      {potId && !config.potAddress ? (
        <Notice
          tone="bad"
          testId="pot-unconfigured"
          title="No contract configured"
          icon={
            <TriangleAlert
              aria-hidden="true"
              className="h-5 w-5 text-[var(--danger)]"
            />
          }
        >
          This demo is not connected to a deployed pot yet. Setup information is
          available on the About page.
        </Notice>
      ) : null}

      {state.status === "loading" && !snapshot ? (
        <Notice
          tone="wait"
          testId="pot-loading"
          title="Reading the pot"
          icon={
            <LoaderCircle
              aria-hidden="true"
              className="h-5 w-5 animate-spin text-[var(--accent)]"
            />
          }
        >
          Reading from the public RPC…
        </Notice>
      ) : null}

      {state.status === "error" ? <ErrorNotice state={state} /> : null}

      {snapshot && state.status !== "error" ? (
        <>
          <PotDetails snapshot={snapshot} config={config} />
          <ActionsPanel
            snapshot={snapshot}
            config={config}
            wallet={wallet}
            status={actions.status}
            busy={actions.busy}
            onRefund={() =>
              void actions.run(
                { kind: "refund", potId: snapshot.potId },
                "Refund",
              )
            }
            onDismiss={actions.dismiss}
          />
          <SeatList
            snapshot={snapshot}
            assetName={assetLabel(config, snapshot.asset)}
            claimDisabled={actions.busy || !wallet.ready}
            onClaim={(seat: Address) =>
              void actions.run(
                { kind: "claim", potId: snapshot.potId, seat },
                "Claim",
              )
            }
          />
          <details className="rounded-xl border border-[var(--border)] p-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
              Deadlines and contract details
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              <PotDetails snapshot={snapshot} config={config} details />
            </div>
          </details>
        </>
      ) : null}

      {potId && config.potAddress ? (
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-busy={loading}
          className="xp-btn xp-btn-ghost w-full sm:w-fit"
        >
          <RefreshCw
            aria-hidden="true"
            className={clsx("h-4 w-4", loading && "animate-spin")}
          />
          {loading ? "Reading…" : "Refresh"}
        </button>
      ) : null}

      {snapshot && state.status === "ready" ? (
        <p className="text-xs text-[var(--subtle)]" data-testid="pot-checked">
          Last read at block {snapshot.blockNumber.toString()}.
        </p>
      ) : null}
    </div>
  );
}
