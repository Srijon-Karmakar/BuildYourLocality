import { create } from 'zustand';

/**
 * How money is written. The balance is one number; the player picks which symbol it wears
 * ($, ₹, ₽, €…). There is no conversion: 100 stays 100 in every currency.
 */

export interface Currency {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', label: 'US dollar' },
  { code: 'INR', symbol: '₹', label: 'Indian rupee' },
  { code: 'RUB', symbol: '₽', label: 'Russian ruble' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British pound' },
  { code: 'JPY', symbol: '¥', label: 'Japanese yen' },
  { code: 'CNY', symbol: 'CN¥', label: 'Chinese yuan' },
  { code: 'KRW', symbol: '₩', label: 'South Korean won' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian real' },
  { code: 'BDT', symbol: '৳', label: 'Bangladeshi taka' },
  { code: 'PKR', symbol: 'Rs', label: 'Pakistani rupee' },
  { code: 'AED', symbol: 'AED ', label: 'UAE dirham' },
  { code: 'TRY', symbol: '₺', label: 'Turkish lira' },
  { code: 'UAH', symbol: '₴', label: 'Ukrainian hryvnia' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian dollar' },
];

const KEY = 'apnagali.currency.v1';

function saved(): string {
  try {
    const code = localStorage.getItem(KEY);
    if (code && CURRENCIES.some((c) => c.code === code)) return code;
  } catch {
    // storage blocked: the default is used
  }
  return 'USD';
}

interface CurrencyState {
  code: string;
  set: (code: string) => void;
}

export const useCurrency = create<CurrencyState>((set) => ({
  code: saved(),
  set: (code) => {
    if (!CURRENCIES.some((c) => c.code === code)) return;
    try {
      localStorage.setItem(KEY, code);
    } catch {
      // ignore
    }
    set({ code });
  },
}));

export const currencyOf = (code: string): Currency => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];

/** "$1,250" in the chosen currency's symbol. */
export function formatMoney(amount: number, code = useCurrency.getState().code): string {
  return `${currencyOf(code).symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

/** The same, re-rendering when the player changes currency. */
export function useMoneyFormat(): (amount: number) => string {
  const code = useCurrency((s) => s.code);
  return (amount) => formatMoney(amount, code);
}
