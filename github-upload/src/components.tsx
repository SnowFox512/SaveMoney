import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ChevronRight, Download, Plus, Trash2, X } from 'lucide-react';
import type { Data, Entry, Wallet, Wish } from './types';
import { addMonths, cycleStart, cycleSummary, money, newData, percent, plainMoney, shortDate, sources, toCents, today, walletName } from './logic';

const asYuan = (c: number) => String(c / 100);
const centsOrNull = (value: string, allowZero = false) => {
  const n = toCents(value);
  return Number.isSafeInteger(n) && n >= 0 && (allowZero || n > 0) ? n : null;
};
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function PageTitle({ tag, title, subtitle }: { tag: string; title: string; subtitle: string }) {
  return <div className="page-title"><span className="eyebrow">{tag}</span><h1>{title}</h1><p>{subtitle}</p></div>;
}
export function Empty({ text }: { text: string }) { return <div className="empty">🌿<p>{text}</p></div>; }
export function GoalCard({ emoji, title, saved, target, color }: { emoji: string; title: string; saved: number; target: number; color: string }) {
  return <div className={`goal-card ${color}`}><div className="goal-head"><span>{emoji}</span><div><strong>{title}</strong><small>目标 {money(target)}</small></div><b>{percent(saved, target)}%</b></div><div className="progress-track"><div style={{ width: `${percent(saved, target)}%` }} /></div><p>已存 <b>{money(saved)}</b></p></div>;
}
export function RecordRow({ entry, onClick }: { entry: Entry; onClick: () => void }) {
  const expense = entry.type === 'expense';
  const out = expense || entry.type === 'transfer';
  const title = expense ? `${walletName[entry.wallet!]}当日合计` : entry.note || entry.source || '钱包转账';
  const detail = entry.type === 'transfer' ? `${walletName[entry.from!]} → ${walletName[entry.to!]}` : expense ? entry.note : entry.wallet ? walletName[entry.wallet] : '';
  return <button className="record-row" onClick={onClick}><span className={`record-symbol ${entry.type}`}>{expense ? <ArrowDownLeft size={19} /> : entry.type === 'transfer' ? <ArrowLeftRight size={18} /> : <Plus size={19} />}</span><span className="record-info"><strong>{title}</strong><small>{shortDate(entry.date)}{detail ? ` · ${detail}` : ''}</small></span><strong className={out ? 'negative' : 'positive'}>{entry.type === 'transfer' ? '' : out ? '-' : '+'}{plainMoney(entry.cents)}</strong><ChevronRight size={15} className="row-chevron" /></button>;
}
export function BudgetLine({ label, emoji, budget, spent }: { label: string; emoji: string; budget: number; spent: number }) {
  return <div className="budget-line"><div><span>{emoji} {label}</span><strong>{money(spent)} <small>/ {money(budget)}</small></strong></div><div className="progress-track"><div style={{ width: `${percent(spent, budget)}%` }} /></div><small>剩余 {money(budget - spent)}</small></div>;
}

export function Setup({ onDone }: { onDone: (d: Data) => void }) {
  const [values, setValues] = useState({ living: '0', fun: '0', saving: '0' });
  const [error, setError] = useState('');
  const submit = () => {
    const living = centsOrNull(values.living, true), fun = centsOrNull(values.fun, true), saving = centsOrNull(values.saving, true);
    if (living === null || fun === null || saving === null) { setError('请填写有效金额，最多两位小数。'); return; }
    onDone(newData({ living, fun, saving }));
  };
  return <div className="setup-wrap"><div className="setup-card card"><span className="setup-emoji">🌷</span><span className="eyebrow">WELCOME</span><h1>一起慢慢攒钱吧</h1><p>先填写三个钱包的真实余额。储蓄目标以后可以在愿望清单自由添加、更换。</p><div className="setup-fields">{(['living', 'fun', 'saving'] as Wallet[]).map(w => <label key={w}>{walletName[w]}当前余额<div className="money-input"><span>¥</span><input inputMode="decimal" value={values[w]} onChange={e => setValues(v => ({ ...v, [w]: e.target.value }))} /></div></label>)}</div><div className="setup-note"><strong>默认预算</strong><span>每月收入 3000 元 · 生活 1800 元 · 娱乐 700 元 · 储蓄 500 元</span><span>2026年10月3日开始，每天结束时记下当日合计</span></div>{error && <p className="error">{error}</p>}<button className="primary wide" onClick={submit}>开始我的计划 <ArrowRight size={18} /></button><small>数据只保存在当前浏览器中，记得定期到设置里导出备份。</small></div></div>;
}

export function EntryForm({ entry, entries, onSave, onDelete, onCancel }: {
  entry: Entry | null; entries: Entry[]; onSave: (e: Entry) => void; onDelete?: () => void; onCancel: () => void;
}) {
  const [type, setType] = useState<Entry['type']>(entry?.type ?? 'expense');
  const [amount, setAmount] = useState(entry ? asYuan(entry.cents) : '');
  const [wallet, setWallet] = useState<Wallet>(entry?.wallet ?? 'living');
  const [from, setFrom] = useState<Wallet>(entry?.from ?? 'living');
  const [to, setTo] = useState<Wallet>(entry?.to ?? 'saving');
  const [source, setSource] = useState(entry?.source ?? '谱师收入');
  const [note, setNote] = useState(entry?.note ?? '');
  const [date, setDate] = useState(entry?.date ?? today());
  const [error, setError] = useState('');
  const existing = type === 'expense' && wallet !== 'saving' ? entries.find(e => e.type === 'expense' && e.wallet === wallet && e.date === date && e.id !== entry?.id) : undefined;
  useEffect(() => {
    if (!entry && type === 'expense') { setAmount(existing ? asYuan(existing.cents) : ''); setNote(existing?.note ?? ''); }
  }, [date, wallet, type, entry?.id, existing?.id]);
  const submit = () => {
    const cents = centsOrNull(amount);
    if (cents === null) { setError('请输入大于 0 的当天合计金额，最多两位小数。'); return; }
    if (type === 'transfer' && from === to) { setError('转出和转入钱包不能相同。'); return; }
    if (!date || date > today()) { setError('请选择不晚于今天的日期。'); return; }
    onSave({ id: entry?.id ?? existing?.id ?? uid(), type, cents, date, note: note.trim(), ...(type === 'expense' ? { wallet } : type === 'income' ? { wallet, source } : { from, to }) });
  };
  return <div className="entry-card card"><div className="segmented">{(['expense', 'income', 'transfer'] as const).map(t => <button key={t} className={type === t ? 'selected' : ''} onClick={() => { setType(t); if (t === 'expense' && wallet === 'saving') setWallet('living'); setError(''); }}>{t === 'expense' ? '每日支出' : t === 'income' ? '收入' : '转账'}</button>)}</div>
    {type === 'expense' && <div className="daily-intro">🌙 每天结束时，填写这个钱包<strong>当天一共花了多少</strong>。同一天同一钱包再次保存会更新合计，不会重复扣款。</div>}
    <div className="amount-field"><span>{type === 'expense' ? '当天总支出（元）' : '金额（元）'}</span><div>¥ <input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div></div>
    <div className="form-grid">
      {type === 'expense' && <label>从哪个钱包支出<select value={wallet} onChange={e => setWallet(e.target.value as Wallet)}><option value="living">生活费</option><option value="fun">娱乐费</option></select></label>}
      {type === 'income' && <><label>收入来源<select value={source} onChange={e => { setSource(e.target.value); if (e.target.value === '卖闲置') setWallet('saving'); }}>{sources.map(s => <option key={s}>{s}</option>)}</select></label><label>收入进入<select value={wallet} onChange={e => setWallet(e.target.value as Wallet)}><option value="living">生活费</option><option value="fun">娱乐费</option><option value="saving">存入储蓄</option></select></label>{source === '卖闲置' && <p className="form-tip">卖闲置收入推荐存入储蓄，可自行修改。</p>}{source === '固定收入' && <p className="form-tip">每月固定收入已自动分配，请避免重复记账。</p>}</>}
      {type === 'transfer' && <><label>转出钱包<select value={from} onChange={e => setFrom(e.target.value as Wallet)}>{(['living', 'fun', 'saving'] as Wallet[]).map(w => <option value={w} key={w}>{walletName[w]}</option>)}</select></label><label>转入钱包<select value={to} onChange={e => setTo(e.target.value as Wallet)}>{(['living', 'fun', 'saving'] as Wallet[]).map(w => <option value={w} key={w}>{walletName[w]}</option>)}</select></label></>}
      <label>日期<input type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></label><label>备注（可选）<input placeholder={type === 'expense' ? '例如：今天的生活费合计' : '写一点小记忆…'} value={note} onChange={e => setNote(e.target.value)} /></label>
    </div>
    {existing && <p className="daily-existing">这一天的{walletName[wallet]}已记 {money(existing.cents)}。保存后会替换原合计。</p>}
    {error && <p className="error">{error}</p>}<div className="entry-actions"><button className="secondary" onClick={onCancel}>取消</button><button className="primary" onClick={submit}>{existing || entry?.type === 'expense' ? '更新当日合计' : '保存记录'}</button></div>{onDelete && <button className="delete-button" onClick={onDelete}><Trash2 size={16} /> 删除这条记录</button>}
  </div>;
}

export function Wishes({ data, balance, save, remove, onPurchase }: {
  data: Data; balance: number; save: (w: Wish) => void; remove: (id: string) => void; onPurchase: (w: Wish) => void;
}) {
  const [draft, setDraft] = useState<Wish | null>(null);
  const [name, setName] = useState(''); const [price, setPrice] = useState('');
  const [size, setSize] = useState<Wish['size']>('small'); const [note, setNote] = useState(''); const [error, setError] = useState('');
  const edit = (w?: Wish) => { setDraft(w ?? { id: uid(), name: '', cents: 0, size: 'small', status: 'want', note: '' }); setName(w?.name ?? ''); setPrice(w ? asYuan(w.cents) : ''); setSize(w?.size ?? 'small'); setNote(w?.note ?? ''); setError(''); };
  const submit = () => { const cents = centsOrNull(price); if (!name.trim() || cents === null) { setError('请填写名称和有效价格。'); return; } save({ id: draft!.id, name: name.trim(), cents, size, status: draft!.status, note }); setDraft(null); };
  return <><PageTitle tag="WISH LIST" title="想买的东西" subtitle="大目标会自动出现在首页的储蓄心愿栏。" /><button className="primary wish-add" onClick={() => edit()}><Plus size={18} /> 添加愿望</button><div className="wish-list">{data.wishes.length ? data.wishes.map(w => <div className="wish-card card" key={w.id}><div className="wish-top"><span className="wish-emoji">{w.size === 'large' ? '🌟' : '🎁'}</span><div><strong>{w.name}</strong><small>{w.size === 'large' ? '大目标' : '小目标'} · {w.status === 'want' ? '想买' : w.status === 'bought' ? '已购买' : '已放弃'}</small></div><b>{money(w.cents)}</b></div>{w.note && <p>{w.note}</p>}{w.size === 'large' && w.status === 'want' && <p className="goal-badge">已显示在首页储蓄目标</p>}{w.status === 'want' && <div className="wish-advice">{w.size === 'small' ? balance >= w.cents ? `当前娱乐费 ${money(balance)}，已经足够购买。` : `当前娱乐费 ${money(balance)}，还差 ${money(w.cents - balance)}。按每月 ${money(data.settings.funBudget)} 的娱乐预算，约 ${Math.ceil((w.cents - balance) / Math.max(1, data.settings.funBudget))} 个预算周期可攒够。` : '这项愿望已经计入总储蓄目标，购买前可以看看当前进度。'}</div>}<div className="wish-actions"><button onClick={() => edit(w)}>编辑</button>{w.status === 'want' && <button onClick={() => onPurchase(w)}>标记为已购买</button>}{w.status !== 'dropped' && <button onClick={() => save({ ...w, status: 'dropped' })}>放弃</button>}{w.status !== 'want' && <button onClick={() => save({ ...w, status: 'want' })}>重新想买</button>}<button onClick={() => { if (confirm('删除这个愿望吗？')) remove(w.id); }}>删除</button></div></div>) : <Empty text="愿望清单还空着，写下第一件想买的东西吧。" />}</div>
    {draft && <div className="modal-backdrop" onClick={() => setDraft(null)}><div className="modal-sheet wish-form" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setDraft(null)}><X /></button><h2>{draft.name ? '编辑愿望' : '添加愿望'}</h2><label>名称<input value={name} onChange={e => setName(e.target.value)} placeholder="例如 iPad 键盘" /></label><label>价格（元）<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="420.00" /></label><label>类型<select value={size} onChange={e => setSize(e.target.value as Wish['size'])}><option value="small">小目标（娱乐费）</option><option value="large">大目标（加入储蓄目标）</option></select></label><label>备注<input value={note} onChange={e => setNote(e.target.value)} placeholder="可选" /></label>{error && <p className="error">{error}</p>}<button className="primary wide" onClick={submit}>保存愿望</button></div></div>}
  </>;
}

export function Stats({ data }: { data: Data }) {
  const current = cycleStart(today(), data.settings.payday);
  const rows = Array.from({ length: 6 }, (_, i) => ({ start: addMonths(current, i - 5, data.settings.payday), ...cycleSummary(data, addMonths(current, i - 5, data.settings.payday)) }));
  const max = Math.max(1, ...rows.flatMap(r => [r.livingSpent, r.funSpent, Math.max(0, r.saving)]));
  const avg = (key: 'livingSpent' | 'funSpent' | 'saving') => Math.round(rows.reduce((n, r) => n + r[key], 0) / 6);
  const tutor = data.entries.filter(e => e.type === 'income' && e.source === '谱师收入').reduce((n, e) => n + e.cents, 0);
  const extra = data.entries.filter(e => e.type === 'income' && e.source !== '固定收入').reduce((n, e) => n + e.cents, 0);
  return <><PageTitle tag="OVERVIEW" title="小小统计" subtitle="回头看看，你已经走了多远。" /><div className="stats-summary"><div className="card"><small>平均生活支出</small><strong>{money(avg('livingSpent'))}</strong></div><div className="card"><small>平均娱乐支出</small><strong>{money(avg('funSpent'))}</strong></div><div className="card"><small>平均每月储蓄</small><strong>{money(avg('saving'))}</strong></div></div><section className="card chart-card"><div className="chart-heading"><h2>最近 6 个预算周期</h2><div className="legend"><span><i className="legend-living" />生活</span><span><i className="legend-fun" />娱乐</span><span><i className="legend-saving" />储蓄</span></div></div><div className="chart-grid">{rows.map(r => <div className="chart-column" key={r.start}><div className="bars"><span className="bar living-bar" style={{ height: `${Math.max(2, r.livingSpent / max * 100)}%` }} title={`生活 ${money(r.livingSpent)}`} /><span className="bar fun-bar" style={{ height: `${Math.max(2, r.funSpent / max * 100)}%` }} title={`娱乐 ${money(r.funSpent)}`} /><span className="bar saving-bar" style={{ height: `${Math.max(2, Math.max(0, r.saving) / max * 100)}%` }} title={`储蓄 ${money(r.saving)}`} /></div><small>{new Date(r.start + 'T12:00:00').getMonth() + 1}月</small></div>)}</div><p className="chart-foot">平均值按最近 6 个预算周期计算，包含尚未结束的周期。</p></section><div className="section-heading"><div><span className="eyebrow">EXTRA INCOME</span><h2>额外收入</h2></div></div><div className="card income-stats"><div><span>🎼 累计谱师收入</span><strong>{money(tutor)}</strong></div><div><span>✨ 累计额外收入</span><strong>{money(extra)}</strong></div></div></>;
}

function MoneySetting({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label>{label}<div className="money-input"><span>¥</span><input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} /></div></label>;
}
export function SettingsPage({ data, setData, exportData, importClick, clearData, notify }: {
  data: Data; setData: Dispatch<SetStateAction<Data | null>>; exportData: () => void; importClick: () => void; clearData: () => void; notify: (s: string) => void;
}) {
  const s = data.settings;
  const legacyBackup = localStorage.getItem('saving-planner-v1-legacy-backup');
  const [values, setValues] = useState({ fixedIncome: asYuan(s.fixedIncome), livingBudget: asYuan(s.livingBudget), funBudget: asYuan(s.funBudget), fixedSaving: asYuan(s.fixedSaving), funCap: asYuan(s.funCap), livingBuffer: asYuan(s.livingBuffer), extraMonthly: asYuan(s.extraMonthly), payday: String(s.payday), startDate: s.startDate, targetDate: s.targetDate });
  const [error, setError] = useState('');
  const set = (name: keyof typeof values, value: string) => setValues(v => ({ ...v, [name]: value }));
  const save = () => {
    const keys = ['fixedIncome', 'livingBudget', 'funBudget', 'fixedSaving', 'funCap', 'livingBuffer', 'extraMonthly'] as const;
    const nums = Object.fromEntries(keys.map(k => [k, centsOrNull(values[k], true)])) as Record<typeof keys[number], number | null>;
    if (Object.values(nums).some(n => n === null)) { setError('金额格式不正确，请保留最多两位小数。'); return; }
    if (nums.livingBudget! + nums.funBudget! + nums.fixedSaving! !== nums.fixedIncome) { setError('生活费、娱乐费和固定储蓄之和需要等于固定月收入。'); return; }
    const day = Number(values.payday);
    if (!Number.isInteger(day) || day < 1 || day > 28) { setError('发生活费日期请选择 1～28 日。'); return; }
    if (!values.startDate || !values.targetDate || values.targetDate < values.startDate) { setError('目标日期需要晚于计划开始日期。'); return; }
    setData(d => d ? { ...d, settings: { ...d.settings, fixedIncome: nums.fixedIncome!, livingBudget: nums.livingBudget!, funBudget: nums.funBudget!, fixedSaving: nums.fixedSaving!, funCap: nums.funCap!, livingBuffer: nums.livingBuffer!, extraMonthly: nums.extraMonthly!, payday: day, startDate: values.startDate, targetDate: values.targetDate } } : d);
    setError(''); notify('设置已保存');
  };
  const exportLegacy = () => {
    if (!legacyBackup) return;
    const url = URL.createObjectURL(new Blob([legacyBackup], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `攒钱计划旧版原始备份-${today()}.json`; a.click(); URL.revokeObjectURL(url);
    notify('旧版原始备份已下载');
  };
  return <><PageTitle tag="PREFERENCES" title="计划设置" subtitle="按照自己的节奏，调整攒钱方式。" /><section className="card settings-card"><h2>每月预算</h2><div className="form-grid"><MoneySetting label="固定月收入" value={values.fixedIncome} onChange={v => set('fixedIncome', v)} /><MoneySetting label="生活费预算" value={values.livingBudget} onChange={v => set('livingBudget', v)} /><MoneySetting label="娱乐费预算" value={values.funBudget} onChange={v => set('funBudget', v)} /><MoneySetting label="固定储蓄" value={values.fixedSaving} onChange={v => set('fixedSaving', v)} /><label>每月发生活费日期<select value={values.payday} onChange={e => set('payday', e.target.value)}>{Array.from({ length: 28 }, (_, i) => <option value={i + 1} key={i}>每月 {i + 1} 日</option>)}</select></label></div><p className="form-tip">每个预算周期从发生活费当天到下个月前一天。月收入需等于三项分配之和。</p></section><section className="card settings-card"><h2>结转规则</h2><div className="form-grid"><MoneySetting label="娱乐费余额上限" value={values.funCap} onChange={v => set('funCap', v)} /><MoneySetting label="生活费缓冲上限" value={values.livingBuffer} onChange={v => set('livingBuffer', v)} /></div><p className="form-tip">超出时只提醒，转入储蓄需要你亲自确认。</p></section><section className="card settings-card"><h2>储蓄计划</h2><div className="form-grid"><MoneySetting label="预计每月额外存入" value={values.extraMonthly} onChange={v => set('extraMonthly', v)} /><label>计划开始日期<input type="date" value={values.startDate} onChange={e => set('startDate', e.target.value)} /></label><label>目标日期<input type="date" value={values.targetDate} onChange={e => set('targetDate', e.target.value)} /></label></div><p className="form-tip">总目标由愿望清单中处于“想买”的大目标自动相加。修改或删除愿望，目标和预测会立即更新。</p></section>{error && <p className="error">{error}</p>}<button className="primary wide settings-save" onClick={save}>保存设置</button><div className="section-heading"><div><span className="eyebrow">DATA & BACKUP</span><h2>数据管理</h2></div></div><section className="card data-actions"><button onClick={exportData}><Download size={19} /><span><strong>导出数据</strong><small>下载当前 JSON 备份</small></span><ArrowRight size={17} /></button>{legacyBackup && <button onClick={exportLegacy}><Download size={19} /><span><strong>导出旧版原始数据</strong><small>升级前的明细备份</small></span><ArrowRight size={17} /></button>}<button onClick={importClick}><ArrowDownLeft size={19} /><span><strong>导入数据</strong><small>支持当前和旧版备份</small></span><ArrowRight size={17} /></button><button className="danger" onClick={clearData}><Trash2 size={19} /><span><strong>清空数据</strong><small>需要二次确认</small></span><ArrowRight size={17} /></button></section><p className="settings-footer">所有数据保存在这台设备的当前浏览器中。换设备或清理浏览器前，请先导出备份。</p></>;
}
