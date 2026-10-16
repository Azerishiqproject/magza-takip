import { eachDayOfInterval, eachMonthOfInterval, eachYearOfInterval, format, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import type { Category, Order, Period, Store, StoreFolder, Transaction, TransactionType } from "./types";

export type ReportPeriod = Period | "all";
export type ReportMetric = "all" | "income" | "expense" | "profit" | "sales";
export type ReportView = "time" | "stores" | "folders" | "categories";
export type StoreScope = "all" | "ungrouped" | `folder:${string}` | `store:${string}`;
export type StatusScope = "all" | Store["status"];
export type ReportRange = { start: string; end: string; error: string | null };
export type ReportTotals = { income: number; expense: number; profit: number; count: number };
export type CategoryOption = { key: string; name: string; type: TransactionType };
export type ReportPoint = ReportTotals & { id: string; label: string };
export type CurrencyReport = ReportTotals & {
  currency: Store["currency"];
  storeCount: number;
  byStore: ReportPoint[];
  byFolder: (ReportPoint & { storeCount: number })[];
  byCategory: (ReportPoint & { type: TransactionType })[];
  timeline: ReportPoint[];
  granularity: "day" | "month" | "year";
};

const emptyTotals = (): ReportTotals => ({ income: 0, expense: 0, profit: 0, count: 0 });
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const add = (totals: ReportTotals, transaction: Transaction) => {
  totals[transaction.type] = (cents(totals[transaction.type]) + cents(transaction.amount)) / 100;
  totals.profit = (cents(totals.income) - cents(totals.expense)) / 100;
  totals.count++;
};

export function validReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && format(date, "yyyy-MM-dd") === value;
}

export function getReportRange(period: ReportPeriod, customStart: string, customEnd: string, transactions: ReadonlyArray<{ date: string }>, today = new Date()): ReportRange {
  const end = format(today, "yyyy-MM-dd");
  if (period === "custom") {
    if (!validReportDate(customStart) || !validReportDate(customEnd)) return { start: "", end: "", error: "Geçerli bir başlangıç ve bitiş tarihi seçin." };
    if (customStart > customEnd) return { start: "", end: "", error: "Başlangıç tarihi bitiş tarihinden sonra olamaz." };
    return { start: customStart, end: customEnd, error: null };
  }
  if (period === "all") {
    const dates = transactions.map((item) => item.date).filter(validReportDate).sort();
    return { start: dates[0] && dates[0] < end ? dates[0] : end, end: dates.at(-1) && dates.at(-1)! > end ? dates.at(-1)! : end, error: null };
  }
  const starts = { day: today, week: startOfWeek(today, { weekStartsOn: 1 }), month: startOfMonth(today), year: startOfYear(today) };
  return { start: format(starts[period], "yyyy-MM-dd"), end, error: null };
}

export function scopedReportStores(stores: Store[], folders: StoreFolder[], scope: StoreScope, status: StatusScope) {
  const folderIds = new Set(folders.map((folder) => folder.id));
  return stores.filter((store) => (status === "all" || store.status === status) && (
    scope === "all" || (scope.startsWith("store:") ? store.id === scope.slice("store:".length) : scope === "ungrouped" ? !store.folderId || !folderIds.has(store.folderId) : store.folderId === scope.slice("folder:".length))
  ));
}

function categoryFor(transaction: Transaction, categories: Map<string, Category>): CategoryOption {
  const candidate = categories.get(transaction.categoryId);
  const name = candidate?.storeId === transaction.storeId ? candidate.name.trim() || "Kategorisiz" : "Kategorisiz";
  return { key: JSON.stringify([transaction.type, name.toLocaleLowerCase("tr-TR")]), name, type: transaction.type };
}

export function reportCategoryOptions(stores: Store[], categories: Category[], transactions: Transaction[]): CategoryOption[] {
  const ids = new Set(stores.map((store) => store.id));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const options = new Map<string, CategoryOption>();
  for (const category of categories.filter((item) => ids.has(item.storeId))) {
    const item = categoryFor({ categoryId: category.id, storeId: category.storeId, type: category.type } as Transaction, byId);
    options.set(item.key, item);
  }
  for (const transaction of transactions.filter((item) => ids.has(item.storeId))) {
    const item = categoryFor(transaction, byId);
    options.set(item.key, item);
  }
  return [...options.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, "tr"));
}

// Financial transactions are the only source of totals: orders must not be counted again.
// Currency groups stay separate so e.g. AZN and USD can never be added together.
export function buildStoreReports(stores: Store[], categories: Category[], transactions: Transaction[], range: ReportRange, categoryKey = "all", folders: StoreFolder[] = []): CurrencyReport[] {
  if (range.error || !validReportDate(range.start) || !validReportDate(range.end) || range.start > range.end) return [];
  const start = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${range.end}T12:00:00`);
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  const granularity = days > 366 * 5 ? "year" : days > 92 ? "month" : "day";
  const dates = granularity === "year" ? eachYearOfInterval({ start, end }) : granularity === "month" ? eachMonthOfInterval({ start, end }) : eachDayOfInterval({ start, end });
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderPointsByStore = new Map<string, CurrencyReport["byFolder"][number]>();
  const groups = new Map<Store["currency"], CurrencyReport>();
  for (const store of storesById.values()) {
    let group = groups.get(store.currency);
    if (!group) {
      group = { ...emptyTotals(), currency: store.currency, storeCount: 0, byStore: [], byFolder: [], byCategory: [], granularity, timeline: dates.map((date) => ({ ...emptyTotals(), id: format(date, granularity === "year" ? "yyyy" : granularity === "month" ? "yyyy-MM" : "yyyy-MM-dd"), label: format(date, granularity === "year" ? "yyyy" : granularity === "month" ? "MM/yyyy" : "dd/MM") })) };
      groups.set(store.currency, group);
    }
    group.storeCount++;
    group.byStore.push({ ...emptyTotals(), id: store.id, label: store.name });
    const folder = store.folderId ? foldersById.get(store.folderId) : undefined;
    const folderId = folder?.id ?? "";
    let folderPoint = group.byFolder.find((point) => point.id === folderId);
    if (!folderPoint) { folderPoint = { ...emptyTotals(), id: folderId, label: folder?.name ?? "Klasörsüz mağazalar", storeCount: 0 }; group.byFolder.push(folderPoint); }
    folderPoint.storeCount++;
    folderPointsByStore.set(store.id, folderPoint);
  }
  const storePoints = new Map([...groups.values()].flatMap((group) => group.byStore.map((point) => [point.id, point] as const)));
  const timePoints = new Map([...groups.values()].map((group) => [group.currency, new Map(group.timeline.map((point) => [point.id, point]))]));
  const categoryPoints = new Map<Store["currency"], Map<string, CurrencyReport["byCategory"][number]>>();
  const seen = new Set<string>();
  for (const transaction of transactions) {
    const store = storesById.get(transaction.storeId);
    if (!store || seen.has(transaction.id) || !validReportDate(transaction.date) || transaction.date < range.start || transaction.date > range.end || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || !["income", "expense"].includes(transaction.type)) continue;
    seen.add(transaction.id);
    const category = categoryFor(transaction, categoriesById);
    if (categoryKey !== "all" && category.key !== categoryKey) continue;
    const group = groups.get(store.currency)!;
    add(group, transaction);
    add(storePoints.get(store.id)!, transaction);
    add(folderPointsByStore.get(store.id)!, transaction);
    const timeId = granularity === "year" ? transaction.date.slice(0, 4) : granularity === "month" ? transaction.date.slice(0, 7) : transaction.date;
    const timePoint = timePoints.get(store.currency)!.get(timeId);
    if (timePoint) add(timePoint, transaction);
    let points = categoryPoints.get(store.currency);
    if (!points) { points = new Map(); categoryPoints.set(store.currency, points); }
    let point = points.get(category.key);
    if (!point) { point = { ...emptyTotals(), id: category.key, label: category.name, type: transaction.type }; points.set(category.key, point); group.byCategory.push(point); }
    add(point, transaction);
  }
  for (const group of groups.values()) {
    group.byFolder.sort((a, b) => b.profit - a.profit || a.label.localeCompare(b.label, "tr"));
    group.byStore.sort((a, b) => b.profit - a.profit || a.label.localeCompare(b.label, "tr"));
    group.byCategory.sort((a, b) => b.income + b.expense - a.income - a.expense || a.label.localeCompare(b.label, "tr"));
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function reportMoney(value: number, currency: Store["currency"]) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}


export type SalesStatus = "valid" | "all" | Order["status"];
export type SalesPoint = { id: string; label: string; sales: number };
export type SalesReport = {
  total: number;
  activeDays: number;
  storeCount: number;
  granularity: "day" | "month" | "year";
  timeline: SalesPoint[];
  byStore: SalesPoint[];
  byFolder: (SalesPoint & { storeCount: number })[];
};

export function matchesSalesStatus(order: Order, status: SalesStatus) {
  if (!["active", "completed", "cancelled"].includes(order.status)) return false;
  return status === "all" || (status === "valid" ? order.status !== "cancelled" : order.status === status);
}

export function orderCreatedDate(order: Pick<Order, "createdAt">): string | null {
  if (typeof order.createdAt !== "string" || !validReportDate(order.createdAt.slice(0, 10))) return null;
  if (order.createdAt.length === 10) return order.createdAt;
  const createdAt = new Date(order.createdAt);
  return Number.isFinite(createdAt.getTime()) ? format(createdAt, "yyyy-MM-dd") : null;
}

// Count order IDs, never financial records or the number of products in a bundle.
// Counts have no currency and include orders that have not produced revenue yet.
export function buildSalesReport(stores: Store[], folders: StoreFolder[], orders: Order[], range: ReportRange, status: SalesStatus = "valid"): SalesReport {
  const result: SalesReport = { total: 0, activeDays: 0, storeCount: 0, granularity: "day", timeline: [], byStore: [], byFolder: [] };
  if (range.error || !validReportDate(range.start) || !validReportDate(range.end) || range.start > range.end) return result;
  const start = new Date(`${range.start}T12:00:00`); const end = new Date(`${range.end}T12:00:00`);
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  result.granularity = days > 366 * 5 ? "year" : days > 366 ? "month" : "day";
  const bucketFormat = result.granularity === "year" ? "yyyy" : result.granularity === "month" ? "yyyy-MM" : "yyyy-MM-dd";
  const dates = result.granularity === "year" ? eachYearOfInterval({ start, end }) : result.granularity === "month" ? eachMonthOfInterval({ start, end }) : eachDayOfInterval({ start, end });
  result.timeline = dates.map((date) => ({ id: format(date, bucketFormat), label: format(date, result.granularity === "day" ? "dd/MM/yyyy" : result.granularity === "month" ? "MM/yyyy" : "yyyy"), sales: 0 }));
  const timePoints = new Map(result.timeline.map((point) => [point.id, point]));
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const storePoints = new Map<string, SalesPoint>();
  const folderPointsByStore = new Map<string, SalesReport["byFolder"][number]>();
  for (const store of new Map(stores.map((item) => [item.id, item])).values()) {
    const point = { id: store.id, label: store.name, sales: 0 };
    storePoints.set(store.id, point); result.byStore.push(point); result.storeCount++;
    const folder = store.folderId ? foldersById.get(store.folderId) : undefined;
    const folderId = folder?.id ?? "";
    let folderPoint = result.byFolder.find((item) => item.id === folderId);
    if (!folderPoint) { folderPoint = { id: folderId, label: folder?.name ?? "Klasörsüz mağazalar", sales: 0, storeCount: 0 }; result.byFolder.push(folderPoint); }
    folderPoint.storeCount++; folderPointsByStore.set(store.id, folderPoint);
  }
  const seen = new Set<string>(); const activeDates = new Set<string>();
  for (const order of orders) {
    const storePoint = storePoints.get(order.storeId);
    if (!storePoint || seen.has(order.id) || !matchesSalesStatus(order, status)) continue;
    const date = orderCreatedDate(order);
    if (!date || date < range.start || date > range.end) continue;
    seen.add(order.id); activeDates.add(date); result.total++; storePoint.sales++;
    folderPointsByStore.get(order.storeId)!.sales++;
    const timePoint = timePoints.get(result.granularity === "year" ? date.slice(0, 4) : result.granularity === "month" ? date.slice(0, 7) : date);
    if (timePoint) timePoint.sales++;
  }
  result.activeDays = activeDates.size;
  result.byStore.sort((a, b) => b.sales - a.sales || a.label.localeCompare(b.label, "tr"));
  result.byFolder.sort((a, b) => b.sales - a.sales || a.label.localeCompare(b.label, "tr"));
  return result;
}
