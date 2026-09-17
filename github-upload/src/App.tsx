import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Check, ChevronLeft, ChevronRight, Heart, Home, List, Plus, Settings as SettingsIcon, X } from 'lucide-react';
import type { Data, Entry, Wallet, Wish } from './types';
import { activeGoals, addMonths, allEntries, balances, carrySuggestions, cycleEnd, cycleStart, cycleSummary, defaults, migrateData, money, nextCycle, percent, plainMoney, rangeLabel, savingPlan, today, upsertDailyExpense, walletName } from './logic';
import { BudgetLine, Empty, EntryForm, GoalCard, PageTitle, RecordRow, SettingsPage, Setup, Stats, Wishes } from './components';

type Page = 'home' | 'bills' | 'add' | 'wishes' | 'stats' | 'settings';
const storageKey = 'saving-planner-v1'; // Keep the existing key so previous users are migrated.
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function App() {
  const [data, setData] = useState<Data | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrateData(parsed);
      if (migrated && (parsed as { version?: number }).version === 1) localStorage.setItem(`${storageKey}-legacy-backup`, raw);
      return migrated;
    } catch { return null; }
  });
  const [page, setPage] = useState<Page>('home');
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [cycle, setCycle] = useState(() => cycleStart(today(), data?.settings.payday ?? defaults.payday));
  const [toast, setToast] = useState('');
  const [purchaseWish, setPurchaseWish] = useState<Wish | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (data) localStorage.setItem(storageKey, JSON.stringify(data)); }, [data]);
  useEffect(() => { if (data) setCycle(cycleStart(today(), data.settings.payday)); }, [data?.settings.payday]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  const notify = (message: string) => setToast(message);
  if (!data) return <Setup onDone={setData} />;

  const current = cycleStart(today(), data.settings.payday);
  const activeCycle = cycle || current;
  const bal = balances(data);
  const plan = savingPlan(data);
  const goals = activeGoals(data);
  let unallocated = plan.saved;
  const summary = cycleSummary(data, current);
  const displayed = cycleSummary(data, activeCycle);
  const suggestions = carrySuggestions(data, current);

  const addEntry = (entry: Entry) => {
    setData(d => d ? { ...d, entries: upsertDailyExpense(d.entries, entry) } : d);
    setEditing(null);
    setPage('home');
    notify(entry.type === 'expense' ? '当日合计已保存' : '记录已保存');
  };
  const removeEntry = (id: string) => {
    if (!confirm('确定删除这条记录吗？')) return;
    setData(d => d ? { ...d, entries: d.entries.filter(e => e.id !== id) } : d);
    setEditing(null); setPage('home'); notify('记录已删除');
  };
  const openAdd = (entry?: Entry) => { setEditing(entry ?? null); setPage('add'); };
  const transferCarry = (from: 'living' | 'fun', amount: number) => {
    if (amount <= 0) return;
    setData(d => d ? { ...d, entries: [...d.entries, { id: uid(), type: 'transfer', date: today(), cents: amount, from, to: 'saving', note: from === 'living' ? '生活费结转' : '娱乐费超额结转' }], carryDismissed: [...d.carryDismissed, `${current}-${from}`] } : d);
    notify('已转入储蓄');
  };
  const dismissCarry = (from: 'living' | 'fun') => setData(d => d ? { ...d, carryDismissed: [...d.carryDismissed, `${current}-${from}`] } : d);
  const saveWish = (wish: Wish) => setData(d => d ? { ...d, wishes: [...d.wishes.filter(w => w.id !== wish.id), wish] } : d);
  const updateWishStatus = (id: string, status: Wish['status']) => setData(d => d ? { ...d, wishes: d.wishes.map(w => w.id === id ? { ...w, status } : w) } : d);
  const addPurchaseToDailyFun = (wish: Wish) => {
    setData(d => {
      if (!d) return d;
      const existing = d.entries.find(e => e.type === 'expense' && e.wallet === 'fun' && e.date === today());
      const expense: Entry = { id: existing?.id ?? uid(), type: 'expense', date: today(), wallet: 'fun', cents: (existing?.cents ?? 0) + wish.cents, note: existing?.note || '当日娱乐费合计' };
      return { ...d, wishes: d.wishes.map(w => w.id === wish.id ? { ...w, status: 'bought' } : w), entries: upsertDailyExpense(d.entries, expense) };
    });
    setPurchaseWish(null); notify('已加入今天的娱乐费合计');
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `攒钱计划备份-${today()}.json`; a.click(); URL.revokeObjectURL(url);
    notify('备份已下载');
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text(); const parsed: unknown = JSON.parse(raw); const imported = migrateData(parsed);
      if (!imported) throw new Error('invalid');
      if (!confirm('导入会覆盖当前全部数据，确定继续吗？')) return;
      if ((parsed as { version?: number }).version === 1) localStorage.setItem(`${storageKey}-legacy-backup`, raw);
      setData(imported); setCycle(cycleStart(today(), imported.settings.payday)); setPage('home'); notify('数据已恢复');
    } catch { alert('文件格式不正确，请选择本应用导出的 JSON 备份。'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const clearData = () => {
    if (!confirm('这会删除本机所有记录。确定要清空吗？')) return;
    if (prompt('请再输入「清空」确认删除') !== '清空') return;
    localStorage.removeItem(storageKey); setData(null); setPage('home');
  };

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mark">✿</div><div><div className="eyebrow">LITTLE BY LITTLE</div><strong>我的攒钱计划</strong></div><span className="top-date">{new Date().getFullYear()}年{new Date().getMonth() + 1}月{new Date().getDate()}日</span></header>
    <main className="main-content">
      {page === 'home' && <>
        <section className="hero card"><div className="hero-top"><div><span className="tiny-label">我的储蓄进度</span><h1>{money(plan.saved)}</h1><p>慢慢来，每一步都算数 ✨</p></div><div className="hero-illustration"><span>✦</span><span>☁</span><span>✿</span></div></div><div className="progress-track big"><div style={{ width: `${percent(plan.saved, plan.goal)}%` }} /></div><div className="hero-foot"><span>{plan.goal ? `目标 ${money(plan.goal)}` : '还没有目标'}</span><b>{plan.goal ? `${percent(plan.saved, plan.goal)}%` : '待设目标'}</b><span>{plan.goal ? `还差 ${money(plan.left)}` : '去添加大目标'}</span></div></section>
        <div className="section-heading"><div><span className="eyebrow">SAVING GOALS</span><h2>想实现的小心愿</h2></div><button className="text-button" onClick={() => setPage('wishes')}>管理愿望 <ArrowRight size={15} /></button></div>
        {goals.length ? <div className="goal-grid">{goals.map((w, i) => { const saved = Math.min(w.cents, unallocated); unallocated -= saved; return <GoalCard key={w.id} emoji="🌟" title={w.name} saved={saved} target={w.cents} color={i % 2 ? 'lavender' : 'peach'} />; })}</div> : <button className="card empty-goals" onClick={() => setPage('wishes')}><span>🌱</span><strong>还没有储蓄目标</strong><small>去愿望清单添加一个大目标吧</small></button>}
        <div className="section-heading"><div><span className="eyebrow">MY WALLETS</span><h2>我的三个钱包</h2></div></div>
        <div className="wallet-grid">{(['living', 'fun', 'saving'] as Wallet[]).map(w => <button key={w} className={`wallet-card ${w}`} onClick={() => setSelectedWallet(w)}><span className="wallet-icon">{w === 'living' ? '🍚' : w === 'fun' ? '🎮' : '🐷'}</span><span className="wallet-name">{walletName[w]} <ArrowRight size={14} /></span><strong>{money(bal[w])}</strong><small>{w === 'saving' ? '每月固定存入' : '每月基础预算'} {money(w === 'living' ? data.settings.livingBudget : w === 'fun' ? data.settings.funBudget : data.settings.fixedSaving)}</small></button>)}</div>
        {today() >= data.settings.startDate && (['living', 'fun'] as const).map(w => suggestions[w] > 0 && !data.carryDismissed.includes(`${current}-${w}`) && <div className="carry-card" key={w}><div><strong>{w === 'living' ? '生活费结转提醒' : '娱乐费结转提醒'}</strong><p>{w === 'living' ? `保留${money(data.settings.livingBuffer)}生活缓冲，可以将${money(suggestions.living)}转入储蓄。` : `娱乐费超过${money(data.settings.funCap)}上限，有${money(suggestions.fun)}可以转入储蓄。`}</p></div><div className="carry-actions"><button className="small-primary" onClick={() => transferCarry(w, suggestions[w])}>转入储蓄</button><button className="quiet-button" onClick={() => dismissCarry(w)}>稍后</button></div></div>)}
        <div className="section-heading"><div><span className="eyebrow">THIS CYCLE</span><h2>本预算周期</h2></div><button className="text-button" onClick={() => { setCycle(current); setPage('bills'); }}>看账单 <ArrowRight size={15} /></button></div>
        <section className="card cycle-card"><p className="muted">{rangeLabel(current, cycleEnd(current, data.settings.payday))}</p><div className="cycle-grid"><div><small>本期收入</small><strong>{money(summary.income)}</strong></div><div><small>生活支出</small><strong>{money(summary.livingSpent)}</strong></div><div><small>娱乐支出</small><strong>{money(summary.funSpent)}</strong></div></div>{today() < data.settings.startDate && <p className="hint">正式计划从 {data.settings.startDate} 开始；当前还未自动发放月度预算。</p>}</section>
        <div className="section-heading"><div><span className="eyebrow">MONTHLY SAVING</span><h2>本月储蓄</h2></div></div>
        <section className="card monthly-card"><div><span className="mini-icon">🌱</span><div><small>本周期已存</small><strong>{money(summary.saving)}</strong></div></div><div className="monthly-note">{plan.goal ? <><p>距离目标还有 <b>{plan.remaining}</b> 个预算周期，平均每期需存 <b>{money(plan.required)}</b>。</p><p>按每月存 {money(plan.perMonth)}，预计 <b>{plan.estimated}</b> 完成。当前{plan.difference >= 0 ? '高于' : '低于'}固定储蓄进度 {money(Math.abs(plan.difference))}。</p></> : <p>添加大目标后，这里会计算每期需要存多少，以及预计完成时间。</p>}</div></section>
        <div className="section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>最近记录</h2></div><button className="text-button" onClick={() => setPage('bills')}>全部 <ArrowRight size={15} /></button></div>
        <div className="card record-card">{data.entries.length ? data.entries.filter(e => e.date <= today()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map(e => <RecordRow key={e.id} entry={e} onClick={() => openAdd(e)} />) : <Empty text="还没有记录，点下方按钮记下第一天的合计吧。" />}</div>
      </>}
      {page === 'bills' && <><PageTitle tag="MONTHLY BILL" title="月度账单" subtitle="每天只需记录生活费和娱乐费的当日合计。" /><div className="cycle-picker card"><button onClick={() => setCycle(addMonths(activeCycle, -1, data.settings.payday))} aria-label="上个周期"><ChevronLeft /></button><div><small>预算周期</small><strong>{rangeLabel(activeCycle, cycleEnd(activeCycle, data.settings.payday))}</strong></div><button onClick={() => setCycle(nextCycle(activeCycle, data.settings.payday))} aria-label="下个周期" disabled={activeCycle >= current}><ChevronRight /></button></div><div className="bill-overview"><div className="card"><small>本周期收入</small><strong className="positive">+{plainMoney(displayed.income)}</strong></div><div className="card"><small>本周期支出</small><strong className="negative">-{plainMoney(displayed.livingSpent + displayed.funSpent)}</strong></div><div className="card"><small>本周期储蓄</small><strong>{money(displayed.saving)}</strong></div><div className="card"><small>本周期结余</small><strong>{money(displayed.net)}</strong></div></div><div className="section-heading"><div><span className="eyebrow">BUDGET DETAILS</span><h2>预算使用</h2></div></div><section className="card budget-detail"><BudgetLine label="生活费" emoji="🍚" budget={data.settings.livingBudget} spent={displayed.livingSpent} /><BudgetLine label="娱乐费" emoji="🎮" budget={data.settings.funBudget} spent={displayed.funSpent} /><div className="budget-saving"><span>🐷 储蓄</span><strong>固定 {money(activeCycle >= data.settings.startDate && activeCycle <= today() ? data.settings.fixedSaving : 0)} · 额外 {money(displayed.extraSaving)}</strong><small>本周期共存 {money(displayed.saving)}</small></div></section><div className="section-heading"><div><span className="eyebrow">DAILY TOTALS</span><h2>每日汇总与其他记录</h2></div></div><div className="card record-card">{displayed.entries.filter(e => !e.recurring).length ? displayed.entries.filter(e => !e.recurring).map(e => <RecordRow key={e.id} entry={e} onClick={() => openAdd(e)} />) : <Empty text="这个周期还没有手动记录。" />}{displayed.entries.some(e => e.recurring) && <div className="recurring-note">每月固定预算已自动计入上方统计。</div>}</div></>}
      {page === 'add' && <><PageTitle tag="DAILY CHECK-IN" title={editing ? '编辑记录' : '记一笔'} subtitle="每天结束时，记下生活费或娱乐费当天一共花了多少。" /><EntryForm key={editing?.id ?? 'new'} entry={editing} entries={data.entries} onSave={addEntry} onDelete={editing ? () => removeEntry(editing.id) : undefined} onCancel={() => { setEditing(null); setPage('home'); }} /></>}
      {page === 'wishes' && <Wishes data={data} balance={bal.fun} save={saveWish} remove={id => setData(d => d ? { ...d, wishes: d.wishes.filter(w => w.id !== id) } : d)} onPurchase={setPurchaseWish} />}
      {page === 'stats' && <Stats data={data} />}
      {page === 'settings' && <SettingsPage data={data} setData={setData} exportData={exportData} importClick={() => fileRef.current?.click()} clearData={clearData} notify={notify} />}
    </main>
    <nav className="bottom-nav" aria-label="主导航">{([{ id: 'home', label: '首页', icon: Home }, { id: 'bills', label: '账单', icon: List }, { id: 'add', label: '记账', icon: Plus }, { id: 'wishes', label: '愿望', icon: Heart }, { id: 'stats', label: '统计', icon: BarChart3 }, { id: 'settings', label: '设置', icon: SettingsIcon }] as const).map(item => <button key={item.id} className={`${page === item.id ? 'active' : ''} ${item.id === 'add' ? 'add-nav' : ''}`} onClick={() => { setSelectedWallet(null); if (item.id === 'add') openAdd(); else setPage(item.id); }}><item.icon size={21} strokeWidth={page === item.id ? 2.5 : 1.9} /><span>{item.label}</span></button>)}</nav>
    {selectedWallet && <div className="modal-backdrop" onClick={() => setSelectedWallet(null)}><div className="modal-sheet" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setSelectedWallet(null)}><X /></button><div className="modal-emoji">{selectedWallet === 'living' ? '🍚' : selectedWallet === 'fun' ? '🎮' : '🐷'}</div><h2>{walletName[selectedWallet]}</h2><p className="muted">当前余额 {money(bal[selectedWallet])}</p><div className="wallet-history">{allEntries(data).filter(e => !e.recurring && (e.wallet === selectedWallet || e.from === selectedWallet || e.to === selectedWallet)).slice(0, 30).map(e => <RecordRow key={e.id} entry={e} onClick={() => { setSelectedWallet(null); openAdd(e); }} />)}{!allEntries(data).some(e => !e.recurring && (e.wallet === selectedWallet || e.from === selectedWallet || e.to === selectedWallet)) && <Empty text="这个钱包还没有记录。" />}</div></div></div>}
    {purchaseWish && <div className="modal-backdrop" onClick={() => setPurchaseWish(null)}><div className="dialog card" onClick={e => e.stopPropagation()}><span className="dialog-emoji">🎁</span><h2>买到啦！</h2><p>要把 {money(purchaseWish.cents)} 加到今天的娱乐费合计中吗？如果这笔钱已包含在今天的合计里，请只标记已购买。</p><div className="dialog-actions"><button className="secondary" onClick={() => { updateWishStatus(purchaseWish.id, 'bought'); setPurchaseWish(null); }}>只标记已购买</button><button className="primary" onClick={() => addPurchaseToDailyFun(purchaseWish)}>标记并加入今日合计</button></div></div></div>}
    <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => importData(e.target.files?.[0])} />{toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

export default App;
