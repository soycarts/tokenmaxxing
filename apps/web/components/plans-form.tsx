"use client";

import { useActionState, useState } from "react";
import { buttonClass, inputClass, pressClass, primaryButtonClass } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";
import {
  CUSTOM,
  CUSTOM_MAX,
  CUSTOM_MIN,
  LABEL_MAX,
  LINES_MAX,
  PLAN_LABEL,
  PLANS,
  PROVIDER_LABEL,
  PROVIDERS,
  QTY_MAX,
  plansMonthlyUsd,
  providerMonthlyUsd,
  sanitizePlans,
  type FormRows,
  type PlansFormState,
  type Provider,
} from "@/lib/plans";

type Action = (prev: PlansFormState, form: FormData) => Promise<PlansFormState>;

const usd = (digits: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd0 = usd(0);
const usd2 = usd(2);
/** $1,020/mo, $19.99/mo */
const money = (n: number) => `${(Number.isInteger(n) ? usd0 : usd2).format(n)}/mo`;

/**
 * Per provider a list of plan rows (plan, seats, remove) plus "Add another plan". Works without
 * JavaScript: add and remove are submit buttons (`name="op"`) that the server action answers
 * with the new rows, unsaved; "Save plans" saves. The custom-amount fields are revealed by CSS
 * (`:has(option:checked)`), so that needs no script either.
 */
export function PlansForm({ action, initial }: { action: Action; initial: PlansFormState }) {
  const [state, formAction] = useActionState(action, initial, "/me");
  // Remount on every add/remove so the uncontrolled fields take the new rows' values.
  return <Rows key={state.v} rows={state.rows} formAction={formAction} />;
}

function Rows({ rows, formAction }: { rows: FormRows; formAction: (form: FormData) => void }) {
  const [live, setLive] = useState(() => sanitizePlans(rowsToForm(rows)));
  return (
    <form action={formAction} onChange={(e) => setLive(sanitizePlans(new FormData(e.currentTarget)))} className="space-y-6">
      {/* The first submit button is what Enter presses: make it Save, not a row's remove. */}
      <button type="submit" name="op" value="save" tabIndex={-1} aria-hidden className="sr-only">
        Save plans
      </button>
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => (
          <ProviderRows key={p} provider={p} rows={rows[p]} monthly={providerMonthlyUsd(p, live[p])} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <SubmitButton name="op" value="save" className={primaryButtonClass} pendingLabel="Saving…">
          Save plans
        </SubmitButton>
        <p className="text-sm text-ink-2">
          Total <span className="num display ml-1 text-2xl text-ink">{money(plansMonthlyUsd(live))}</span>
        </p>
      </div>
    </form>
  );
}

const removeClass = `${pressClass} inline-flex h-[46px] w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-xl leading-none text-ink-2 [--lift:3px] hover:bg-sunk hover:text-danger`;
const addClass = `${buttonClass} !px-3.5 !py-2 !text-[0.85rem] [--lift:3px]`;

function ProviderRows({ provider, rows, monthly }: { provider: Provider; rows: FormRows[Provider]; monthly: number }) {
  const name = PROVIDER_LABEL[provider];
  const onlyBlank = rows.length === 1 && !rows[0].plan;
  return (
    <fieldset className="min-w-0 rounded-2xl border-2 border-line bg-sunk/60 px-3 pb-4 pt-3 sm:px-4">
      <legend className="sr-only">{name}</legend>
      <div aria-hidden className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{name}</span>
        <span className={`num text-sm ${monthly > 0 ? "font-semibold text-ink" : "text-muted"}`}>{monthly > 0 ? money(monthly) : "none"}</span>
      </div>
      <input type="hidden" name={`rows_${provider}`} value={rows.length} />
      <ul className="mt-2.5 space-y-2.5">
        {rows.map((r, i) => {
          const id = `${provider}_${i}`;
          const n = rows.length > 1 ? ` ${i + 1}` : "";
          return (
            <li key={id} className="group/row">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <label htmlFor={`plan_${id}`} className="sr-only">{`${name} plan${n}`}</label>
                <select id={`plan_${id}`} name={`plan_${id}`} defaultValue={r.plan} className={`${inputClass} min-w-0 flex-1 !pl-3 !pr-2 sm:!pl-3.5`}>
                  <option value="">None</option>
                  {Object.entries(PLANS[provider]).map(([plan, usd]) => (
                    <option key={plan} value={plan}>
                      {(PLAN_LABEL[provider] as Record<string, string>)[plan]} · ${usd}
                    </option>
                  ))}
                  <option value={CUSTOM}>Custom amount</option>
                </select>
                <label htmlFor={`qty_${id}`} className="sr-only">{`Seats of ${name} plan${n}`}</label>
                <div className="relative w-14 shrink-0 sm:w-[4.5rem]">
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">×</span>
                  <input
                    id={`qty_${id}`}
                    name={`qty_${id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={QTY_MAX}
                    step={1}
                    defaultValue={r.qty}
                    className={`${inputClass} num !pl-6 !pr-2`}
                  />
                </div>
                {onlyBlank ? (
                  <span aria-hidden className="w-11 shrink-0" />
                ) : (
                  <SubmitButton name="op" value={`remove:${provider}:${i}`} formNoValidate pendingLabel="" className={removeClass} aria-label={`Remove ${name} plan${n}`}>
                    <span aria-hidden>×</span>
                  </SubmitButton>
                )}
              </div>
              <div className="mt-2 hidden gap-1.5 sm:gap-2 group-has-[option[value=custom]:checked]/row:flex">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">{`Label for ${name} custom plan${n}`}</span>
                  <input name={`label_${id}`} defaultValue={r.label} maxLength={LABEL_MAX} placeholder="Label, e.g. Codex promo" className={inputClass} />
                </label>
                <label className="relative w-[6.5rem] shrink-0 sm:w-[7.5rem]">
                  <span className="sr-only">{`Monthly price per seat, USD`}</span>
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <input
                    name={`monthly_${id}`}
                    type="number"
                    inputMode="decimal"
                    min={CUSTOM_MIN}
                    max={CUSTOM_MAX}
                    step={0.01}
                    defaultValue={r.monthly}
                    placeholder="per mo"
                    className={`${inputClass} num !pl-6 !pr-2`}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length < LINES_MAX && (
        <div className="mt-3">
          <SubmitButton name="op" value={`add:${provider}`} formNoValidate pendingLabel="Adding…" className={addClass}>
            Add another plan
          </SubmitButton>
        </div>
      )}
    </fieldset>
  );
}

/** The rows as the FormData the form would post, for the first render's totals. */
function rowsToForm(rows: FormRows): FormData {
  const f = new FormData();
  for (const p of PROVIDERS) {
    f.set(`rows_${p}`, String(rows[p].length));
    rows[p].forEach((r, i) => {
      f.set(`plan_${p}_${i}`, r.plan);
      f.set(`qty_${p}_${i}`, r.qty);
      f.set(`label_${p}_${i}`, r.label);
      f.set(`monthly_${p}_${i}`, r.monthly);
    });
  }
  return f;
}
