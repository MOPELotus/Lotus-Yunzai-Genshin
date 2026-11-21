const prices = [68, 30, 648, 328, 198, 98, 30, 6] as const;
const products = ["大月卡", "小月卡", "648", "328", "198", "98", "30", "6"] as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function whole(value: unknown) {
  const numeric = typeof value === "string" && /^\d{1,16}$/u.test(value) ? Number(value) : value;
  return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : undefined;
}
const invalid = () => new TypeError("当前角色的旧充值账本格式无效。");

export function readLegacyGenshinPayLog(document: unknown, uid: string) {
  const root = object(document);
  if (!root) throw invalid();
  if (!Object.hasOwn(root, uid)) return;
  const ledger = object(root[uid]);
  const crystal = whole(ledger?.crystal);
  if (!ledger || String(ledger.uid) !== uid || !Array.isArray(ledger.monthData) ||
      ledger.monthData.length > 240 || crystal === undefined) throw invalid();

  const counts = prices.map(() => 0);
  const bars = ledger.monthData.map((raw: unknown) => {
    const month = object(raw);
    const name = month?.month;
    if (!month || typeof name !== "string" || !/^(?:[1-9]|1[0-2])月$/u.test(name) ||
        !Array.isArray(month.payNum) || month.payNum.length !== prices.length) throw invalid();
    let amount = 0;
    for (const [i, price] of prices.entries()) {
      const count = whole(month.payNum[i]);
      if (count === undefined) throw invalid();
      counts[i] = (counts[i] ?? 0) + count;
      amount += count * price;
      if (!Number.isSafeInteger(counts[i]) || !Number.isSafeInteger(amount)) throw invalid();
    }
    return { name, amount };
  });
  let highest = bars[0];
  let paid = 0;
  for (const bar of bars) {
    if (!highest || bar.amount >= highest.amount) highest = bar;
    paid += bar.amount;
    if (!Number.isSafeInteger(paid)) throw invalid();
  }
  const amounts = counts.map((count, i) => count * prices[i]!);
  // ECharts rounds the slice labels together so their hundredths add up to 100%.
  const quotas = amounts.map(amount => paid ? amount / paid * 10_000 : 0);
  const seats = quotas.map(Math.floor);
  if (paid) {
    const order = quotas.map((quota, i) => ({ i, fraction: quota - seats[i]! }))
      .sort((a, b) => b.fraction - a.fraction);
    const remaining = 10_000 - seats.reduce((sum, count) => sum + count, 0);
    for (const { i } of order.slice(0, remaining)) seats[i] = seats[i]! + 1;
  }
  const purchases = counts.map((count, i) => ({ name: products[i]!, count, amount: amounts[i]!, share: seats[i]! / 100 }));
  return { uid, crystal, bars, purchases, paid, highest };
}

export type GenshinPayLog = NonNullable<ReturnType<typeof readLegacyGenshinPayLog>>;
