import type { ChonksConfig } from "../config";
import { XpWindow } from "./XpWindow";

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <p className="text-sm font-semibold text-[var(--ink)]">{term}</p>
      <p className="text-sm text-pretty text-[var(--muted)]">{children}</p>
    </li>
  );
}

export function AboutPage({ config }: { config: ChonksConfig }) {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="about-page">
      <XpWindow title="A conditional multi-party pot">
        <p className="text-sm text-pretty text-[var(--muted)]">
          ConditionalPot is a small, reusable escrow. Two to four parties each
          lock the same amount of one token (USDC or EURC). A rule fixed at the
          start determines payouts after an agreed result or an uncontested
          oracle proposal. Expired funding, a missing result or a contested
          proposal opens refunds. One contract holds many pots. Nothing in it is
          specific to any game.
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--warn)]">
          PLAY MONEY. Arc Testnet only. Not audited by an independent firm.
        </p>
      </XpWindow>

      <XpWindow title="How a pot ends">
        <ul className="flex flex-col gap-3">
          <Item term="Everyone agrees">
            Every seat signs the same result. The pot pays out at once.
          </Item>
          <Item term="An oracle proposes (optional)">
            A named address may propose a result after a minimum play time. Any
            seat can freeze it during a challenge window, and freezing refunds
            everyone. If nobody does, anyone can finalize it.
          </Item>
          <Item term="Nothing is settled">
            If the pot is not full by its funding deadline, or is still waiting
            for a result at its settle deadline, anyone can trigger refunds. An
            existing oracle proposal follows its challenge window instead.
          </Item>
          <Item term="Payouts are pulled, per seat">
            Anyone can trigger a claim, which always pays the designated seat.
            One seat that cannot receive tokens never blocks the others.
          </Item>
        </ul>
      </XpWindow>

      <XpWindow title="Payout rules">
        <ul className="flex flex-col gap-3">
          <Item term="Winner takes all / Equal among top">
            The whole pot is split equally among the seats that placed first.
          </Item>
          <Item term="Top two 70/30">
            Place 1 shares 70% and place 2 shares 30%. If every seat ties, the
            pot is split equally.
          </Item>
          <Item term="Rounding">
            Amounts are whole base units (six decimals). Any leftover unit goes
            to the lowest-numbered seat that placed first, and the payouts
            always add up to the full pot.
          </Item>
        </ul>
      </XpWindow>

      <XpWindow title="Who has to be trusted" testId="trust-model">
        <ul className="flex flex-col gap-3">
          <Item term="Nobody is in charge">
            There is no owner, no pause switch, no upgrade path, no fee and no
            way to change the allowed tokens.
          </Item>
          <Item term="You sign exact terms">
            Each seat signs a hash that the contract computes from the pot id,
            token, stake, seats in order, rule, oracle, both deadlines, the
            challenge window, the minimum play time and a commitment to
            off-chain rules. Change any one and the signature no longer works.
          </Item>
          <Item term="The oracle can only propose">
            It cannot move money, and a single seat can force a refund instead
            of accepting its result.
          </Item>
          <Item term="The token issuer is trusted">
            Circle controls USDC and EURC. It can blocklist an address or
            upgrade a token, which could stop a seat from being paid or freeze
            the contract. The pot cannot work around that.
          </Item>
          <Item term="Some things cannot be recovered">
            Tokens sent straight to the contract cannot be taken back. There is
            no rescue function by design.
          </Item>
        </ul>
      </XpWindow>

      <XpWindow title="This console" testId="about-config">
        <p className="text-sm text-pretty text-[var(--muted)]">
          Reading a pot needs no wallet and uses a public RPC only. A wallet is
          used only when you press a button to create a pot, refund or claim,
          and only on {config.chainName} ({config.chainId}). It sends no
          analytics.
        </p>
        <p
          className="mt-2 text-sm text-pretty text-[var(--muted)]"
          data-testid="about-deployment"
        >
          {config.potAddress ? (
            <>
              Configured contract address:{" "}
              <span className="mono break-all">{config.potAddress}</span>. This
              page has not verified that the code at that address matches the
              source.
            </>
          ) : (
            "No contract address is configured, so this console is not connected to a deployment yet."
          )}
        </p>
      </XpWindow>
    </div>
  );
}
