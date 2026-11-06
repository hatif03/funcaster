import { useCallback, useMemo, useState } from "react";
import {
  LoaderCircle,
  SearchCheck,
  Send,
  TriangleAlert,
  CircleCheck,
} from "lucide-react";
import clsx from "clsx";
import type { ChonksConfig } from "../config";
import { usePotActions } from "../hooks/usePotActions";
import { useWallet } from "../hooks/useWallet";
import { preflightCreate, type CreateCheck } from "../lib/createCheck";
import {
  EMPTY_FORM,
  randomPotId,
  toCreateArgs,
  validateCreateForm,
  type CreateFormValues,
} from "../lib/createForm";
import { StatusLine, WalletBar } from "./ActionsPanel";
import { CreateFields } from "./CreateFields";
import { TermsReview } from "./TermsReview";
import { XpWindow } from "./XpWindow";

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

export function CreatePage({ config }: { config: ChonksConfig }) {
  const [values, setValues] = useState<CreateFormValues>(EMPTY_FORM);
  const [check, setCheck] = useState<CreateCheck | "checking" | undefined>();
  const [clock, setClock] = useState<bigint>(nowSeconds);
  const [submittedId, setSubmittedId] = useState<string>();
  const wallet = useWallet(config);
  const actions = usePotActions(config, wallet, () => undefined);

  const chainTime =
    typeof check === "object" && check.status === "ok"
      ? check.chainTime
      : undefined;
  const result = useMemo(
    () => validateCreateForm(values, config, chainTime ?? clock),
    [values, config, chainTime, clock],
  );
  const touched = JSON.stringify(values) !== JSON.stringify(EMPTY_FORM);
  const errors = result.ok || !touched ? {} : result.errors;

  const update = useCallback((patch: Partial<CreateFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setClock(nowSeconds());
    setCheck(undefined); // any edit invalidates a previous contract check
  }, []);
  const onSeat = useCallback((index: number, value: string) => {
    setValues((prev) => ({
      ...prev,
      seats: prev.seats.map((s, i) => (i === index ? value : s)),
    }));
    setClock(nowSeconds());
    setCheck(undefined);
  }, []);

  const runCheck = useCallback(async () => {
    if (!result.ok) return;
    setCheck("checking");
    setCheck(await preflightCreate(config, result.value));
  }, [config, result]);

  const configured = Boolean(config.potAddress);
  const checkedOk =
    result.ok &&
    typeof check === "object" &&
    check.status === "ok" &&
    check.forHash === result.value.termsHash;
  const reasons: string[] = [];
  if (!configured)
    reasons.push(
      "No ConditionalPot address is configured (VITE_CHONKS_POT_ADDRESS).",
    );
  if (configured && !result.ok) reasons.push("Complete every field correctly.");
  if (configured && result.ok && !checkedOk)
    reasons.push("Check the terms against the contract first.");
  if (configured && !wallet.account) reasons.push("Connect a wallet.");
  if (configured && wallet.account && !wallet.chainOk)
    reasons.push(
      `Switch your wallet to ${config.chainName} (${config.chainId}).`,
    );
  const canSubmit =
    configured &&
    result.ok &&
    checkedOk &&
    wallet.ready &&
    !wallet.busy &&
    !actions.busy;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="create-page">
      <XpWindow title="Create a pot">
        <p className="text-sm text-pretty text-[var(--muted)]">
          This sends one transaction to the ConditionalPot contract from your
          own wallet. It is a test network and the funds are play money. Nothing
          is requested from your wallet until you press the final button.
        </p>
      </XpWindow>

      {!configured ? (
        <div
          role="alert"
          data-testid="create-unconfigured"
          className="rounded-2xl border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-4 text-sm"
        >
          <p className="display text-lg font-semibold">Creation is disabled</p>
          <p className="mt-0.5 text-[var(--muted)]">
            This console has no ConditionalPot address. The contract owner
            deploys it and sets{" "}
            <span className="mono">VITE_CHONKS_POT_ADDRESS</span>; until then
            you can fill in the form and review the terms, but nothing can be
            submitted.
          </p>
        </div>
      ) : null}

      <fieldset
        disabled={actions.busy}
        className="flex min-w-0 flex-col gap-3 border-0 p-0"
      >
        <CreateFields
          values={values}
          errors={errors}
          config={config}
          onChange={update}
          onSeat={onSeat}
          onGenerate={() => update({ potId: randomPotId() })}
        />
      </fieldset>

      {result.ok ? <TermsReview value={result.value} /> : null}

      <XpWindow title="Check and create" testId="create-actions">
        <button
          type="button"
          className="xp-btn xp-btn-ghost w-full"
          disabled={!configured || !result.ok || check === "checking"}
          onClick={() => void runCheck()}
          data-testid="check-terms"
        >
          {check === "checking" ? (
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <SearchCheck aria-hidden="true" className="h-4 w-4" />
          )}
          Check terms against the contract
        </button>
        <p className="mt-1 text-xs text-[var(--subtle)]">
          Public reads only: chain, contract code, allowed token, hash, free id,
          deadline.
        </p>

        {typeof check === "object" ? (
          <div
            role={check.status === "ok" ? "status" : "alert"}
            data-testid="check-result"
            data-status={check.status === "ok" ? "ok" : check.code}
            className={clsx(
              "mt-3 flex min-w-0 items-start gap-2 rounded-lg border p-3 text-sm",
              check.status === "ok"
                ? "border-[var(--success)]/40 bg-[var(--success)]/10"
                : "border-[var(--danger)]/50 bg-[var(--danger)]/10",
            )}
          >
            {check.status === "ok" ? (
              <CircleCheck
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]"
              />
            ) : (
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]"
              />
            )}
            <span className="min-w-0 break-words">
              {check.status === "ok"
                ? "The contract computes the same terms hash and accepts this token, id and deadline."
                : check.message}
            </span>
          </div>
        ) : null}

        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <WalletBar wallet={wallet} config={config} />
        </div>

        <button
          type="button"
          className="xp-btn mt-4 w-full"
          disabled={!canSubmit}
          data-testid="create-submit"
          onClick={() => {
            if (result.ok) {
              setSubmittedId(result.value.terms.potId);
              void actions.run(
                { kind: "create", args: toCreateArgs(result.value.terms) },
                "Create",
              );
            }
          }}
        >
          <Send aria-hidden="true" className="h-4 w-4" />
          Create pot with my wallet (testnet)
        </button>
        {!canSubmit && reasons.length > 0 ? (
          <ul
            className="mt-2 list-disc pl-5 text-sm text-[var(--warn)]"
            data-testid="create-disabled-reason"
          >
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        <StatusLine
          status={actions.status}
          config={config}
          onDismiss={actions.dismiss}
        />
        {actions.status.phase === "done" && submittedId ? (
          <a
            className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] underline"
            href={`${import.meta.env.BASE_URL}?pot=${submittedId}`}
          >
            Open this pot
          </a>
        ) : null}
      </XpWindow>
    </div>
  );
}
