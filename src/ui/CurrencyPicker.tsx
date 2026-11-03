import { CURRENCIES, formatMoney, useCurrency } from '../lib/currency';

/** Which currency symbol the money wears. Only the symbol changes: 100 stays 100. */
export function CurrencyPicker() {
  const code = useCurrency((s) => s.code);
  const set = useCurrency((s) => s.set);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="currency" className="flex items-baseline justify-between">
        <span className="text-white">Currency</span>
        <span className="text-[11px] text-white/45">e.g. {formatMoney(1250, code)}</span>
      </label>
      <select
        id="currency"
        value={code}
        onChange={(e) => set(e.target.value)}
        className="rounded-full bg-white/10 px-3.5 py-2 text-base text-white outline-none sm:text-sm [&>option]:bg-neutral-900"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.symbol.trim()} · {c.label} ({c.code})
          </option>
        ))}
      </select>
      <span className="text-[11px] leading-snug text-white/45">Changes the symbol only. The amount stays the same in every currency.</span>
    </div>
  );
}
