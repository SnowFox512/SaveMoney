export type Wallet = 'living' | 'fun' | 'saving';
export type Entry = {
  id: string; type: 'expense' | 'income' | 'transfer'; cents: number; date: string;
  wallet?: Wallet; from?: Wallet; to?: Wallet; source?: string; note?: string; recurring?: boolean;
};
export type Wish = { id: string; name: string; cents: number; size: 'small' | 'large'; status: 'want' | 'bought' | 'dropped'; note: string };
export type Settings = {
  fixedIncome: number; livingBudget: number; funBudget: number; fixedSaving: number; payday: number;
  funCap: number; livingBuffer: number; startDate: string; targetDate: string; extraMonthly: number;
};
export type Data = {
  version: 2; createdDate: string; initial: Record<Wallet, number>; settings: Settings;
  entries: Entry[]; wishes: Wish[]; carryDismissed: string[];
};
