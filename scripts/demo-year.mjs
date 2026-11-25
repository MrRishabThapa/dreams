#!/usr/bin/env node
// Dev-only: generates a realistic, deterministic year of Dreams data as a backup file.
// Usage: node scripts/demo-year.mjs [YYYY-MM-DD today] > demo-backup.json
// Restore it from Settings → Restore (or the welcome screen). Never shipped in the app bundle.

const PAD = (n, w = 2) => String(n).padStart(w, '0');

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addMonths = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const i = y * 12 + mo - 1 + n;
  return `${Math.floor(i / 12)}-${PAD((i % 12) + 1)}`;
};
const daysIn = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
};

const CATS = [
  ['Food', 'expense', 'utensils', '#FF9500'], ['Transport', 'expense', 'bus', '#007AFF'], ['Bills', 'expense', 'receipt', '#30B0C7'],
  ['Rent', 'expense', 'house', '#A2845E'], ['Shopping', 'expense', 'shopping-bag', '#FF2D55'], ['Health', 'expense', 'heart-pulse', '#FF3B30'],
  ['Education', 'expense', 'graduation-cap', '#5856D6'], ['Family', 'expense', 'users', '#00C7BE'], ['Entertainment', 'expense', 'clapperboard', '#32ADE6'],
  ['Other', 'expense', 'circle-ellipsis', '#8E8E93'], ['Salary', 'income', 'briefcase', '#34C759'], ['Business', 'income', 'store', '#007AFF'],
  ['Gift', 'income', 'gift', '#FF2D55'], ['Interest', 'income', 'percent', '#30B0C7'], ['Other', 'income', 'circle-ellipsis', '#8E8E93'],
];

/**
 * @param {string} today YYYY-MM-DD; the year ends in this month (only up to this day).
 * @returns {{ backup: object, expectedOther: Record<string, number> }}
 */
export function demoYear(today) {
  const r = rng(20261125);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const endMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const startMonth = addMonths(endMonth, -11);
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${PAD((++seq).toString(16), 12)}`;
  const stamp = (date) => `${date}T09:${PAD(Math.floor(seq / 60) % 60)}:${PAD(seq % 60)}.000Z`;
  const base = (date) => ({ id: id(), created_at: stamp(date), updated_at: stamp(date), deleted_at: null });
  const day = (m, d) => `${m}-${PAD(Math.min(d, daysIn(m)))}`;
  const startDay = `${startMonth}-01`;

  const acct = (name, kind, opening, icon, color, sort) => ({ ...base(startDay), name, kind, opening_minor: opening * 100, icon, color, sort, archived: false });
  const cash = acct('Cash', 'cash', 8500, 'banknote', '#34C759', 0);
  const bank = acct('NIC Asia', 'bank', 140000, 'landmark', '#007AFF', 1);
  const esewa = acct('eSewa', 'wallet', 2000, 'smartphone', '#5856D6', 2);
  const savings = acct('Rainy day fund', 'savings', 60000, 'piggy-bank', '#FF9500', 3);
  const nepse = acct('NEPSE portfolio', 'investment', 150000, 'trending-up', '#30B0C7', 4);
  const accounts = [cash, bank, esewa, savings, nepse];

  const categories = CATS.map(([name, type, icon, color], i) => ({ ...base(startDay), name, type, icon, color, sort: i }));
  const cat = (name, type = 'expense') => categories.find((c) => c.name === name && c.type === type);

  const transactions = [];
  const debts = [];
  const dreams = [];
  const dream_entries = [];
  const expectedOther = {};

  const tx = (date, type, rupees, account, extra = {}) => {
    if (date.slice(0, 7) === endMonth && Number(date.slice(8, 10)) > todayDay) return null;
    const t = {
      ...base(date), type, amount_minor: Math.round(rupees * 100), account_id: account.id, to_account_id: null,
      category_id: null, category_name: null, occurred_on: date, note: '', debt_id: null, debt_event: null, ...extra,
    };
    transactions.push(t);
    return t;
  };
  const spend = (date, rupees, account, catName, note = '') => {
    const c = cat(catName);
    return tx(date, 'expense', rupees, account, { category_id: c.id, category_name: c.name, note });
  };
  const earn = (date, rupees, account, catName, note = '') => {
    const c = cat(catName, 'income');
    return tx(date, 'income', rupees, account, { category_id: c.id, category_name: c.name, note });
  };
  const move = (date, rupees, from, to, note = '') => tx(date, 'transfer', rupees, from, { to_account_id: to.id, note });

  const foods = ['Momo', 'Groceries', 'Dal bhat', 'Tea & snacks', 'Bhatbhateni', 'Fruit', 'Lunch with team', 'Bakery'];
  const shops = ['Shoes', 'Kurta', 'Headphones', 'Daraz order', 'Gift for Aama', 'Jacket'];

  // dreams
  const dream = (title, icon, color, target, startM) => {
    const d = { ...base(day(startM, 1)), title, icon, color, target_minor: target * 100, target_on: null, completed_at: null };
    dreams.push(d);
    return d;
  };
  const japan = dream('Japan trip', 'plane', 'sky', 250000, startMonth);
  japan.target_on = day(addMonths(endMonth, 10), 15);
  const emergency = dream('Emergency fund', 'shield', 'mint', 100000, startMonth);
  const laptop = dream('New laptop', 'laptop', 'lilac', 160000, addMonths(startMonth, 5));
  let emergencySaved = 0;

  for (let i = 0; i < 12; i++) {
    const m = addMonths(startMonth, i);
    expectedOther[m] = 0;
    earn(day(m, 1), 85000, bank, 'Salary', 'Monthly salary');
    if (i % 3 === 1) earn(day(m, int(12, 20)), int(12, 25) * 1000, bank, 'Business', 'Freelance design');
    if (m.endsWith('-10')) earn(day(m, 8), 40000, bank, 'Gift', 'Dashain bonus');
    if (i % 6 === 5) earn(day(m, 28), int(800, 1400), savings, 'Interest', 'Savings interest');
    spend(day(m, 2), 18000, bank, 'Rent', 'Flat in Jhamsikhel');
    move(day(m, 3), 12000, bank, cash, 'ATM');
    move(day(m, 3), 4000, bank, esewa, 'Top-up');
    spend(day(m, 10), int(1800, 3100), esewa, 'Bills', 'Electricity + internet');
    spend(day(m, 12), 600, esewa, 'Bills', 'Phone recharge');
    move(day(m, 5), 10000, bank, savings, 'Monthly saving');
    move(day(m, 6), 5000, bank, nepse, 'SIP');
    for (let k = 0, n = int(12, 18); k < n; k++) spend(day(m, int(1, 28)), int(15, 120) * 10, k % 4 === 0 ? esewa : cash, 'Food', foods[int(0, foods.length - 1)]);
    for (let k = 0, n = int(8, 12); k < n; k++) spend(day(m, int(1, 28)), int(5, 40) * 10, cash, 'Transport', k % 3 ? 'Bus' : 'Pathao');
    for (let k = 0, n = int(1, 3); k < n; k++) spend(day(m, int(1, 28)), int(8, 60) * 100, k % 2 ? esewa : bank, 'Shopping', shops[int(0, shops.length - 1)]);
    if (r() < 0.6) spend(day(m, int(1, 28)), int(6, 35) * 100, cash, 'Entertainment', 'Movie night');
    if (r() < 0.35) spend(day(m, int(1, 28)), int(5, 40) * 100, bank, 'Health', 'Pharmacy');
    if (r() < 0.5) spend(day(m, int(1, 28)), int(30, 80) * 100, bank, 'Family', 'Sent home');
    if (i === 4 || i === 9) spend(day(m, 15), int(40, 90) * 100, bank, 'Education', 'Online course');
    tx(day(m, 28), 'adjust', int(-40, 70) * 100, nepse, { note: 'Portfolio value update' });
    if (i % 4 === 2) tx(day(m, 27), 'adjust', int(-6, 4) * 10, cash, { note: 'Cash count' });

    // debts
    if (i === 2) {
      const d = { ...base(day(m, 9)), person: 'Hari Dai', direction: 'owe', amount_minor: 5000000, opened_on: day(m, 9), due_on: day(addMonths(m, 6), 9), note: 'For the scooter repair' };
      debts.push(d);
      tx(day(m, 9), 'income', 50000, bank, { debt_id: d.id, debt_event: 'open' });
      for (let k = 1; k <= 5; k++) tx(day(addMonths(m, k), 20), 'expense', 10000, bank, { debt_id: d.id, debt_event: 'pay' });
    }
    if (i === 6) {
      const d = { ...base(day(m, 14)), person: 'Sita', direction: 'owed', amount_minor: 800000, opened_on: day(m, 14), due_on: day(addMonths(m, 2), 14), note: 'Laptop repair' };
      debts.push(d);
      tx(day(m, 14), 'expense', 8000, cash, { debt_id: d.id, debt_event: 'open' });
      tx(day(addMonths(m, 1), 18), 'income', 3000, cash, { debt_id: d.id, debt_event: 'pay' });
    }
    if (i === 10) {
      // a tab at the corner shop, recorded without cash → shows as "other"
      const d = { ...base(day(m, 16)), person: 'Kirana Pasal', direction: 'owe', amount_minor: 235000, opened_on: day(m, 16), due_on: day(addMonths(m, 1), 28), note: 'Groceries on credit' };
      debts.push(d);
      expectedOther[m] -= 235000;
    }

    // dreams (earmarks; Japan gets a real linked transfer every other month)
    const entry = (d, date, rupees, txId = null, note = '') => {
      if (date.slice(0, 7) === endMonth && Number(date.slice(8, 10)) > todayDay) return;
      dream_entries.push({ ...base(date), dream_id: d.id, amount_minor: rupees * 100, entered_on: date, note, transaction_id: txId });
    };
    if (i % 2 === 0) {
      const t = move(day(m, 7), 8000, bank, savings, 'For Japan trip');
      if (t) entry(japan, day(m, 7), 8000, t.id);
    } else entry(japan, day(m, 7), 6000);
    if (emergencySaved < 100000) {
      const add = Math.min(10000, 100000 - emergencySaved);
      entry(emergency, day(m, 5), add);
      emergencySaved += add;
      if (emergencySaved >= 100000) emergency.completed_at = `${day(m, 5)}T10:00:00.000Z`;
    }
    if (i >= 5) entry(laptop, day(m, 25), 12000);
  }

  const user_settings = [{ ...base(startDay), currency: 'NPR', symbol: 'Rs', monthly_savings_target_minor: 2500000, theme: 'auto', auto_sync: false }];
  const backup = {
    app: 'dreams', version: 1, exported_at: `${today}T12:00:00.000Z`,
    tables: { accounts, categories, transactions, debts, dreams, dream_entries, audits: [], user_settings },
  };
  return { backup, expectedOther };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = new Date();
  const today = process.argv[2] ?? `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
  process.stdout.write(JSON.stringify(demoYear(today).backup, null, 1));
}
