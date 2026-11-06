import {
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import type { ChonksConfig } from "../config";
import type { ActionStatus } from "../hooks/usePotActions";
import type { WalletState } from "../hooks/useWallet";
import { buildTxExplorerUrl } from "../onchain-facts";
import { shortenAddress } from "../lib/format";
import {
  formatChainTime,
  formatDuration,
  refundStatus,
  secondsUntil,
  type PotSnapshot,
} from "../lib/pot";
import { XpWindow } from "./XpWindow";

interface ActionsPanelProps {
  snapshot: PotSnapshot;
  config: ChonksConfig;
  wallet: WalletState;
  status: ActionStatus;
  busy: boolean;
  onRefund: () => void;
  onDismiss: () => void;
}

export function StatusLine({
  status,
  config,
  onDismiss,
}: {
  status: ActionStatus;
  config: ChonksConfig;
  onDismiss: () => void;
}) {
  if (status.phase === "idle") return null;
  const link = (hash: `0x${string}`) => (
    <a
      href={buildTxExplorerUrl(config.chainId, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="mono ml-1 inline-flex items-center gap-1 break-all text-[var(--accent)] underline"
    >
      {shortenAddress(hash, 8, 6)}
      <ExternalLink aria-hidden="true" className="h-3 w-3" />
    </a>
  );
  const base =
    "mt-3 flex min-w-0 items-start gap-2 rounded-lg border p-3 text-sm";
  if (status.phase === "wallet") {
    return (
      <p
        role="status"
        data-testid="tx-status"
        className={`${base} border-[var(--border)] bg-[var(--surface)]`}
      >
        <LoaderCircle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]"
        />
        <span>Confirm {status.label.toLowerCase()} in your wallet…</span>
      </p>
    );
  }
  if (status.phase === "confirming") {
    return (
      <p
        role="status"
        data-testid="tx-status"
        className={`${base} border-[var(--border)] bg-[var(--surface)]`}
      >
        <LoaderCircle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]"
        />
        <span className="min-w-0">
          Waiting for confirmation. {link(status.hash)}
        </span>
      </p>
    );
  }
  if (status.phase === "done") {
    return (
      <p
        role="status"
        data-testid="tx-status"
        className={`${base} border-[var(--success)]/40 bg-[var(--success)]/10`}
      >
        <CircleCheck
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]"
        />
        <span className="min-w-0">
          {status.label} confirmed. {link(status.hash)}
        </span>
      </p>
    );
  }
  return (
    <div
      role="alert"
      data-testid="tx-status"
      className={`${base} border-[var(--danger)]/50 bg-[var(--danger)]/10`}
    >
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]"
      />
      <span className="min-w-0 flex-1 break-words">
        {status.message}
        {status.hash ? link(status.hash) : null}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-11 shrink-0 px-2 text-xs underline"
      >
        Dismiss
      </button>
    </div>
  );
}

export function WalletBar({
  wallet,
  config,
}: {
  wallet: WalletState;
  config: ChonksConfig;
}) {
  if (!wallet.account) {
    return (
      <>
        <p className="text-sm text-pretty text-[var(--muted)]">
          Reading needs no wallet. Connect one only to send a transaction.
          Nothing is requested until you press the button.
        </p>
        <button
          type="button"
          className="xp-btn xp-btn-ghost mt-2 w-full"
          onClick={() => void wallet.connect()}
          disabled={wallet.busy || !wallet.hasWallet}
          data-testid="connect-wallet"
        >
          <Wallet aria-hidden="true" className="h-4 w-4" />
          {wallet.hasWallet ? "Connect wallet" : "No browser wallet found"}
        </button>
        {wallet.error ? (
          <p
            role="alert"
            className="mt-2 text-sm text-[var(--danger)]"
            data-testid="wallet-error"
          >
            {wallet.error}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <>
      <p className="text-sm text-[var(--muted)]" data-testid="wallet-account">
        Wallet{" "}
        <span className="mono">{shortenAddress(wallet.account, 6, 4)}</span>{" "}
        will pay the network fee.
      </p>
      {!wallet.chainOk ? (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-[var(--warn)]/50 bg-[var(--warn)]/10 p-3 text-sm"
          data-testid="wrong-chain"
        >
          <p className="text-[var(--warn)]">
            Your wallet is on{" "}
            {wallet.walletChainId === undefined
              ? "an unknown network"
              : `chain ${wallet.walletChainId}`}
            . Transactions are disabled until it is on {config.chainName} (
            {config.chainId}), a test network.
          </p>
          <button
            type="button"
            className="xp-btn xp-btn-ghost mt-2 w-full"
            onClick={() => void wallet.switchChain()}
            disabled={wallet.busy}
          >
            Switch wallet network
          </button>
        </div>
      ) : null}
      {wallet.error ? (
        <p
          role="alert"
          className="mt-2 text-sm text-[var(--danger)]"
          data-testid="wallet-error"
        >
          {wallet.error}
        </p>
      ) : null}
    </>
  );
}

export function ActionsPanel({
  snapshot,
  config,
  wallet,
  status,
  busy,
  onRefund,
  onDismiss,
}: ActionsPanelProps) {
  const refund = refundStatus(snapshot);
  const wait = refund.opensAt ? secondsUntil(snapshot, refund.opensAt) : 0;
  const needsWallet = refund.available && !wallet.ready;

  return (
    <XpWindow title="Actions" testId="actions-panel">
      <button
        type="button"
        className="xp-btn w-full"
        disabled={
          !refund.available || busy || !config.potAddress || !wallet.ready
        }
        onClick={onRefund}
        data-testid="refund-button"
      >
        <Undo2 aria-hidden="true" className="h-4 w-4" />
        Refund everyone
      </button>
      <p
        className="mt-2 text-sm text-pretty text-[var(--muted)]"
        data-testid="refund-reason"
      >
        {refund.reason}
        {refund.opensAt && wait > 0
          ? ` About ${formatDuration(wait)} left (${formatChainTime(refund.opensAt)}).`
          : ""}
      </p>
      {needsWallet ? (
        <p
          className="mt-1 text-xs text-[var(--warn)]"
          data-testid="refund-needs-wallet"
        >
          Refund is available. Connect a wallet on {config.chainName} to send
          it.
        </p>
      ) : null}
      <p className="mt-1 text-xs text-[var(--subtle)]">
        Refund is open to anyone once its conditions are met. It only returns
        each funded stake to its seat.
      </p>

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <WalletBar wallet={wallet} config={config} />
      </div>
      <StatusLine status={status} config={config} onDismiss={onDismiss} />
    </XpWindow>
  );
}
