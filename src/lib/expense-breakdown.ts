import type { Category, Transaction } from "./types";

export type ExpenseSlice = { id: string | null; name: string; value: number; color: string; count: number; share: number };
const palette = ["#ff8277", "#efb965", "#61b8ef", "#a895e5", "#65c7ad"];

// Transactions are already filtered to the requested period by the dashboard.
// Missing categories still belong in the distribution and its total.
export function buildExpenseBreakdown(storeId: string, categories: Category[], transactions: Transaction[]) {
  const ownCategories = new Map(categories.filter((category) => category.storeId === storeId).map((category) => [category.id, category]));
  const records = new Map(transactions.filter((item) => item.storeId === storeId && item.type === "expense" && Number.isFinite(item.amount) && item.amount > 0).map((item) => [item.id, item]));
  const groups = new Map<string | null, ExpenseSlice>();
  let totalCents = 0;
  for (const item of records.values()) {
    const amount = Math.round((item.amount + Number.EPSILON) * 100);
    const category = ownCategories.get(item.categoryId);
    const id = category?.id ?? null;
    let group = groups.get(id);
    if (!group) {
      group = { id, name: category?.name.trim() || "Kategorisiz", value: 0, color: category?.color || (category ? palette[groups.size % palette.length] : "#81909c"), count: 0, share: 0 };
      groups.set(id, group);
    }
    group.value += amount; group.count++; totalCents += amount;
  }
  const items = [...groups.values()].map((group) => ({ ...group, share: totalCents ? group.value / totalCents * 100 : 0, value: group.value / 100 })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "tr"));
  return { total: totalCents / 100, count: records.size, items };
}
