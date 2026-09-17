import type { Data, Entry, Settings, Wallet, Wish } from './types';

export const walletName: Record<Wallet, string> = { living: '生活费', fun: '娱乐费', saving: '储蓄' };
export const sources = ['固定收入', '谱师收入', '卖闲置', '压岁钱/红包', '其他收入'];
export const defaults: Settings = {
  fixedIncome: 300000, livingBudget: 180000, funBudget: 70000, fixedSaving: 50000,
  payday: 3, funCap: 120000, livingBuffer: 30000,
  startDate: '2026-10-03', targetDate: '2028-12-31', extraMonthly: 50000,
};
export const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const today = () => ymd(new Date());
export const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addMonths = (s: string, n: number, day: number) => { const d = parseDate(s); return ymd(new Date(d.getFullYear(), d.getMonth() + n, day, 12)); };
export const previousDay = (s: string) => { const d = parseDate(s); d.setDate(d.getDate() - 1); return ymd(d); };
export const money = (c: number) => `${c < 0 ? '-' : ''}¥${(Math.abs(c) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const plainMoney = (c: number) => `${(c / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const toCents = (value: string) => { if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return NaN; const [a, b = ''] = value.trim().split('.'); return Number(a) * 100 + Number(b.padEnd(2, '0')); };
export const percent = (a: number, b: number) => b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0;
export const monthLabel = (s: string) => { const d = parseDate(s); return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月`; };
export const shortDate = (s: string) => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export const rangeLabel = (start: string, end: string) => `${start.replaceAll('-', '.')} - ${end.replaceAll('-', '.')}`;

export function cycleStart(date: string, day: number) { const d = parseDate(date); return ymd(new Date(d.getFullYear(), d.getMonth() - (d.getDate() < day ? 1 : 0), day, 12)); }
export function nextCycle(start: string, day: number) { return addMonths(start, 1, day); }
export function cycleEnd(start: string, day: number) { return previousDay(nextCycle(start, day)); }
export function cyclesBetween(start: string, end: string, day: number) {
  const list: string[] = []; let cursor = cycleStart(start, day);
  if (cursor < start) cursor = nextCycle(cursor, day);
  while (cursor <= end && list.length < 1200) { list.push(cursor); cursor = nextCycle(cursor, day); }
  return list;
}
function recurringEntries(data: Data, through = today()): Entry[] {
  const { settings: s } = data;
  const begin = data.createdDate > s.startDate ? data.createdDate : s.startDate;
  return cyclesBetween(begin, through, s.payday).flatMap(date => [
    { id: `budget-${date}-living`, type: 'income', date, cents: s.livingBudget, wallet: 'living', source: '固定收入', recurring: true },
    { id: `budget-${date}-fun`, type: 'income', date, cents: s.funBudget, wallet: 'fun', source: '固定收入', recurring: true },
    { id: `budget-${date}-saving`, type: 'income', date, cents: s.fixedSaving, wallet: 'saving', source: '固定收入', recurring: true },
  ] as Entry[]);
}
export function allEntries(data: Data, through = today()): Entry[] {
  return [...data.entries, ...recurringEntries(data, through)].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function balances(data: Data, through = today()) {
  const result = { ...data.initial };
  for (const e of allEntries(data, through)) {
    if (e.date > through) continue;
    if (e.type === 'income' && e.wallet) result[e.wallet] += e.cents;
    if (e.type === 'expense' && e.wallet) result[e.wallet] -= e.cents;
    if (e.type === 'transfer' && e.from && e.to) { result[e.from] -= e.cents; result[e.to] += e.cents; }
  }
  return result;
}
export function beforeCycleBalance(data: Data, start: string) { return balances(data, previousDay(start)); }
export function entriesForCycle(data: Data, start: string) {
  const end = cycleEnd(start, data.settings.payday);
  return allEntries(data, end).filter(e => e.date >= start && e.date <= end);
}
export function cycleSummary(data: Data, start: string) {
  const entries = entriesForCycle(data, start);
  const sum = (test: (e: Entry) => boolean) => entries.filter(test).reduce((n, e) => n + e.cents, 0);
  const income = sum(e => e.type === 'income' && !e.recurring);
  const recurring = sum(e => e.type === 'income' && !!e.recurring);
  const livingSpent = sum(e => e.type === 'expense' && e.wallet === 'living');
  const funSpent = sum(e => e.type === 'expense' && e.wallet === 'fun');
  const savedIn = sum(e => e.type === 'transfer' && e.to === 'saving') + sum(e => e.type === 'income' && e.wallet === 'saving' && !e.recurring);
  const savedOut = sum(e => e.type === 'transfer' && e.from === 'saving') + sum(e => e.type === 'expense' && e.wallet === 'saving');
  const saving = savedIn - savedOut + sum(e => !!e.recurring && e.wallet === 'saving');
  return { income: income + recurring, livingSpent, funSpent, saving, extraSaving: savedIn - savedOut, net: income + recurring - livingSpent - funSpent - saving, entries };
}
export function carrySuggestions(data: Data, start: string, asOf = today()) {
  if (start < data.settings.startDate || start > asOf) return { living: 0, fun: 0 };
  const before = beforeCycleBalance(data, start);
  const { livingBuffer, funCap, funBudget } = data.settings;
  return { living: Math.max(0, before.living - livingBuffer), fun: Math.max(0, before.fun + funBudget - funCap) };
}
export const activeGoals = (data: Data) => data.wishes.filter(w => w.size === 'large' && w.status === 'want');
export function savingPlan(data: Data, asOf = today()) {
  const s = data.settings;
  const goal = activeGoals(data).reduce((n, w) => n + w.cents, 0);
  const saved = Math.max(0, balances(data, asOf).saving);
  const left = Math.max(0, goal - saved);
  const firstFuture = asOf < s.startDate ? s.startDate : nextCycle(cycleStart(asOf, s.payday), s.payday);
  const remaining = cyclesBetween(firstFuture, s.targetDate, s.payday).length;
  const required = goal && remaining ? Math.ceil(left / remaining) : left;
  const plannedSaved = cyclesBetween(s.startDate, asOf, s.payday).length * s.fixedSaving;
  const difference = saved - plannedSaved;
  const perMonth = s.fixedSaving + s.extraMonthly;
  let estimated = '添加大目标后计算';
  if (goal && !left) estimated = '已经完成';
  else if (goal && perMonth > 0) estimated = monthLabel(addMonths(firstFuture, Math.ceil(left / perMonth) - 1, s.payday));
  else if (goal) estimated = '暂无法预计';
  return { goal, saved, left, remaining, required, difference, estimated, perMonth };
}
// A day's amount is a replacement total, not another individual purchase.
export function upsertDailyExpense(entries: Entry[], expense: Entry): Entry[] {
  if (expense.type !== 'expense' || !expense.wallet) return [...entries.filter(e => e.id !== expense.id), expense];
  return [...entries.filter(e => e.id !== expense.id && !(e.type === 'expense' && e.date === expense.date && e.wallet === expense.wallet)), expense];
}
export function newData(initial: Data['initial'], createdDate = today()): Data {
  return { version: 2, createdDate, initial, settings: structuredClone(defaults), entries: [], wishes: [], carryDismissed: [] };
}
const moneyOk = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
const dateOk = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && ymd(parseDate(x)) === x;
export function validData(input: unknown): input is Data {
  if (!input || typeof input !== 'object') return false;
  const d = input as Data;
  const wallets: Wallet[] = ['living', 'fun', 'saving'];
  return d.version === 2 && dateOk(d.createdDate) && !!d.initial && wallets.every(w => moneyOk(d.initial[w])) &&
    !!d.settings && [d.settings.fixedIncome, d.settings.livingBudget, d.settings.funBudget, d.settings.fixedSaving, d.settings.funCap, d.settings.livingBuffer, d.settings.extraMonthly].every(moneyOk) &&
    Number.isInteger(d.settings.payday) && d.settings.payday >= 1 && d.settings.payday <= 28 && dateOk(d.settings.startDate) && dateOk(d.settings.targetDate) &&
    Array.isArray(d.entries) && d.entries.every(e => typeof e.id === 'string' && ['income', 'expense', 'transfer'].includes(e.type) && moneyOk(e.cents) && dateOk(e.date) && (!e.wallet || wallets.includes(e.wallet)) && (!e.from || wallets.includes(e.from)) && (!e.to || wallets.includes(e.to))) &&
    Array.isArray(d.wishes) && d.wishes.every(w => typeof w.id === 'string' && typeof w.name === 'string' && moneyOk(w.cents) && ['small', 'large'].includes(w.size) && ['want', 'bought', 'dropped'].includes(w.status)) &&
    Array.isArray(d.carryDismissed) && d.carryDismissed.every(x => typeof x === 'string');
}
export function migrateData(input: unknown): Data | null {
  if (validData(input)) return input;
  if (!input || typeof input !== 'object') return null;
  const old = input as Record<string, unknown>;
  if (old.version !== 1 || !old.initial || !old.settings || !Array.isArray(old.entries) || !Array.isArray(old.wishes) || !Array.isArray(old.carryDismissed)) return null;
  const legacy = old as unknown as Data;
  const d: Data = {
    version: 2, createdDate: legacy.createdDate, initial: legacy.initial,
    settings: {
      fixedIncome: legacy.settings.fixedIncome, livingBudget: legacy.settings.livingBudget,
      funBudget: legacy.settings.funBudget, fixedSaving: legacy.settings.fixedSaving,
      payday: legacy.settings.payday, funCap: legacy.settings.funCap,
      livingBuffer: legacy.settings.livingBuffer, startDate: legacy.settings.startDate,
      targetDate: legacy.settings.targetDate, extraMonthly: legacy.settings.extraMonthly,
    },
    entries: [], wishes: legacy.wishes.map((w: Wish) => ({ id: w.id, name: w.name, cents: w.cents, size: w.size, status: w.status, note: w.note })),
    carryDismissed: legacy.carryDismissed,
  };
  if (!validData(d)) return null;
  const daily = new Map<string, Entry>();
  for (const e of legacy.entries) {
    if (e.type !== 'expense' || !e.wallet || e.wallet === 'saving') { d.entries.push(e); continue; }
    const key = `${e.date}-${e.wallet}`;
    const prior = daily.get(key);
    if (prior) { prior.cents += e.cents; prior.note = '旧版明细汇总'; }
    else daily.set(key, { id: e.id, type: 'expense', cents: e.cents, wallet: e.wallet, date: e.date, note: e.note });
  }
  d.entries.push(...daily.values());
  return validData(d) ? d : null;
}
