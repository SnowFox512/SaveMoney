import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleStart, cycleEnd, cyclesBetween, newData, balances, cycleSummary, savingPlan, toCents, carrySuggestions, validData, migrateData, upsertDailyExpense } from '../src/logic.ts';

test('预算周期以每月 3 日为界，跨年也正确', () => {
  assert.equal(cycleStart('2026-11-02', 3), '2026-10-03');
  assert.equal(cycleStart('2026-11-03', 3), '2026-11-03');
  assert.equal(cycleEnd('2026-12-03', 3), '2027-01-02');
  assert.deepEqual(cyclesBetween('2026-10-03', '2026-12-02', 3), ['2026-10-03', '2026-11-03']);
});
test('金额以整数分计算', () => {
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents('0.02'), 2);
  assert.ok(Number.isNaN(toCents('0.001')));
  const d = newData({ living: 1000, fun: 0, saving: 0 }, '2026-09-17');
  d.entries = [{ id: 'a', type: 'expense', cents: 12, date: '2026-09-17', wallet: 'living' }];
  assert.equal(balances(d, '2026-09-17').living, 988);
});
test('固定月度预算仅在发放日计入一次', () => {
  const d = newData({ living: 0, fun: 0, saving: 0 }, '2026-09-17');
  assert.deepEqual(balances(d, '2026-10-02'), { living: 0, fun: 0, saving: 0 });
  assert.deepEqual(balances(d, '2026-10-03'), { living: 180000, fun: 70000, saving: 50000 });
  assert.deepEqual(balances(d, '2026-11-02'), balances(d, '2026-10-03'));
  assert.deepEqual(balances(d, '2026-11-03'), { living: 360000, fun: 140000, saving: 100000 });
});
test('一天同一钱包再次保存会替换合计，日期或钱包变化也不会重复', () => {
  const d = newData({ living: 10000, fun: 10000, saving: 0 }, '2026-09-17');
  d.entries = upsertDailyExpense(d.entries, { id: 'one', type: 'expense', cents: 1850, date: '2026-09-17', wallet: 'living' });
  d.entries = upsertDailyExpense(d.entries, { id: 'two', type: 'expense', cents: 2025, date: '2026-09-17', wallet: 'living' });
  assert.equal(d.entries.length, 1);
  assert.equal(balances(d, '2026-09-17').living, 7975);
  assert.equal(cycleSummary(d, '2026-09-03').livingSpent, 2025);
  d.entries = upsertDailyExpense(d.entries, { ...d.entries[0], date: '2026-09-18', wallet: 'fun', cents: 3000 });
  assert.equal(d.entries.length, 1);
  assert.equal(balances(d, '2026-09-18').living, 10000);
  assert.equal(balances(d, '2026-09-18').fun, 7000);
  d.entries = d.entries.filter(e => e.id !== 'two');
  assert.equal(balances(d, '2026-09-18').fun, 10000);
});
test('结转是提醒，不自动转账', () => {
  const d = newData({ living: 45000, fun: 60000, saving: 0 }, '2026-09-17');
  assert.deepEqual(carrySuggestions(d, '2026-10-03', '2026-10-03'), { living: 15000, fun: 10000 });
  assert.deepEqual(balances(d, '2026-10-03'), { living: 225000, fun: 130000, saving: 50000 });
});
test('大愿望决定总目标，修改、放弃和删除立即重新计算', () => {
  const d = newData({ living: 0, fun: 0, saving: 100000 }, '2026-09-17');
  assert.equal(savingPlan(d, '2026-09-17').goal, 0);
  assert.equal(savingPlan(d, '2026-09-17').estimated, '添加大目标后计算');
  d.wishes = [{ id: 'wish', name: '相机', cents: 42000, size: 'large', status: 'want', note: '' }];
  assert.equal(savingPlan(d, '2026-09-17').goal, 42000);
  d.wishes[0].cents = 50000;
  assert.equal(savingPlan(d, '2026-09-17').goal, 50000);
  d.wishes[0].status = 'dropped';
  assert.equal(savingPlan(d, '2026-09-17').goal, 0);
  d.wishes = [];
  assert.equal(savingPlan(d, '2026-09-17').goal, 0);
});
test('旧版备份迁移保留余额和收入，合并每日支出并去掉固定目标', () => {
  const old = {
    version: 1, createdDate: '2026-09-17', initial: { living: 45000, fun: 60000, saving: 100000 },
    settings: { ...newData({ living: 0, fun: 0, saving: 0 }).settings, goals: { mac: 1500000, trip: 700000 } },
    entries: [
      { id: 'a', type: 'expense', cents: 1800, date: '2026-09-17', wallet: 'living', category: '吃饭' },
      { id: 'b', type: 'expense', cents: 600, date: '2026-09-17', wallet: 'living', category: '交通' },
      { id: 'c', type: 'income', cents: 50000, date: '2026-09-17', wallet: 'saving', source: '谱师收入' },
    ],
    wishes: [{ id: 'w', name: '相机', cents: 42000, size: 'large', status: 'want', note: '', asSavingGoal: false }],
    carryDismissed: [], macAllocation: 100000, allocationBaselineSaving: 100000,
  };
  const migrated = migrateData(old);
  assert.ok(migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.entries.length, 2);
  assert.equal(migrated.entries.find(e => e.type === 'expense').cents, 2400);
  assert.deepEqual(balances(migrated, '2026-09-17'), { living: 42600, fun: 60000, saving: 150000 });
  assert.equal(savingPlan(migrated, '2026-09-17').goal, 42000);
  assert.equal('goals' in migrated.settings, false);
  assert.equal(validData(migrated), true);
});
test('备份数据结构校验', () => {
  const d = newData({ living: 1, fun: 2, saving: 3 }, '2026-09-17');
  assert.equal(validData(JSON.parse(JSON.stringify(d))), true);
  assert.equal(validData({ ...d, initial: { living: -1, fun: 2, saving: 3 } }), false);
});
