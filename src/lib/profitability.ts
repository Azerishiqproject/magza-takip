import { validReportDate } from "./store-analytics";
import { calculateOrderProfitability, moneyCents as cents, validMoney } from "./order-profitability";
import type { Category, Order, Product, ProfitSettings, Store, Transaction } from "./types";

export { breakEvenRoas } from "./order-profitability";
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ə/g, "e");

export function suggestedProfitCategories(storeId: string, categories: Category[]) {
  const own = categories.filter((c) => c.storeId === storeId);
  return {
    advertisingCategoryIds: [] as string[],
    salesCategoryIds: own.filter((c) => c.type === "income" && /siparis gelir|order income/.test(normalize(c.name))).map((c) => c.id),
  };
}

export function validateProfitSettings(settings: ProfitSettings, storeId: string, categories: Category[]) {
  if (!settings) throw new Error("Gelir ve reklam kategorilerini seçin.");
  for (const field of ["advertisingCategoryIds", "salesCategoryIds"] as const) {
    if (!Array.isArray(settings[field]) || settings[field].some((id) => !categories.some((c) => c.id === id && c.storeId === storeId && c.type === (field === "salesCategoryIds" ? "income" : "expense")))) throw new Error("Bu mağazaya ait geçerli kategoriler seçin.");
  }
  if (!settings.advertisingCategoryIds.length) throw new Error("Reklam gideri için en az bir kategori seçin.");
  if (!settings.salesCategoryIds.length && categories.some((c) => c.storeId === storeId && c.type === "income")) throw new Error("Satış gelirinin hesaplanacağı kategoriyi seçin.");
}

export type Profitability = ReturnType<typeof calculateProfitability>;

// Revenue comes only from selected financial records. Link each receipt to its
// completed order, charging products, shipping and packaging once per package.
export function calculateProfitability(store: Store, categories: Category[], transactions: Transaction[], orders: Order[] = [], products: Product[] = []) {
  const roles = store.profitSettings ?? suggestedProfitCategories(store.id, categories);
  const categoryMap = new Map(categories.filter((c) => c.storeId === store.id).map((c) => [c.id, c]));
  const salesIds = (roles.salesCategoryIds.length ? roles.salesCategoryIds : suggestedProfitCategories(store.id, categories).salesCategoryIds).filter((id) => categoryMap.get(id)?.type === "income");
  const advertisingIds = roles.advertisingCategoryIds.filter((id) => categoryMap.get(id)?.type === "expense");
  const orderMap = new Map(orders.filter((o) => o.storeId === store.id && o.status === "completed").map((o) => [o.id, o]));
  const records = [...new Map(transactions.filter((t) => t.storeId === store.id && validReportDate(t.date) && validMoney(t.amount) && t.amount > 0 && ["income", "expense"].includes(t.type)).map((t) => [t.id, t])).values()];
  const receipts = new Map<string, { order: Order; revenue: number; date: string }>();
  let revenue = 0, adSpend = 0, saleRecords = 0, unmatchedRevenue = 0, unmatchedRecords = 0;
  for (const record of records) {
    const amount = cents(record.amount);
    if (record.type === "expense" && advertisingIds.includes(record.categoryId)) adSpend += amount;
    else if (record.type === "income" && salesIds.includes(record.categoryId)) {
      revenue += amount; saleRecords++;
      const order = record.orderId ? orderMap.get(record.orderId) : undefined;
      if (!order) { unmatchedRevenue += amount; unmatchedRecords++; continue; }
      const group = receipts.get(order.id);
      if (group) { group.revenue += amount; if (record.date < group.date) group.date = record.date; }
      else receipts.set(order.id, { order, revenue: amount, date: record.date });
    }
  }
  const orderResults = [...receipts.values()].map(({ order, revenue, date }) => ({
    orderId: order.id, customerName: order.customerName, product: order.product, date, revenue: revenue / 100,
    ...calculateOrderProfitability(store, order, products, revenue / 100),
  })).sort((a, b) => b.date.localeCompare(a.date) || a.orderId.localeCompare(b.orderId));
  const missingCostOrders = orderResults.filter((o) => o.totalCost === null).length;
  const costComplete = unmatchedRecords === 0 && missingCostOrders === 0;
  const purchase = costComplete ? orderResults.reduce((sum, o) => sum + cents(o.purchaseCost!), 0) : null;
  const shipping = costComplete ? orderResults.reduce((sum, o) => sum + cents(o.shippingCost!), 0) : null;
  const packaging = costComplete ? orderResults.reduce((sum, o) => sum + cents(o.packagingCost), 0) : null;
  const cost = purchase === null || shipping === null || packaging === null ? null : purchase + shipping + packaging;
  const contribution = cost === null ? null : revenue - cost;
  return {
    revenue: revenue / 100, adSpend: adSpend / 100,
    purchaseCost: purchase === null ? null : purchase / 100,
    shippingCost: shipping === null ? null : shipping / 100,
    packagingCost: packaging === null ? null : packaging / 100,
    productCost: cost === null ? null : cost / 100,
    profit: contribution === null || !advertisingIds.length ? null : (contribution - adSpend) / 100,
    roas: adSpend > 0 ? revenue / adSpend : null,
    breakEven: contribution !== null && contribution > 0 && revenue > 0 ? revenue / contribution : null,
    saleRecords, orderCount: receipts.size, soldUnits: costComplete ? orderResults.reduce((sum, o) => sum + o.units!, 0) : null,
    configured: Boolean(store.profitSettings), costComplete, missingCostOrders,
    missingProducts: [...new Set(orderResults.flatMap((o) => o.missingProducts))],
    missingShippingOrders: orderResults.filter((o) => o.missingShipping).length,
    unmatchedRevenue: unmatchedRevenue / 100, unmatchedRecords, orderResults,
    noSalesCategory: salesIds.length === 0, noAdvertisingCategory: advertisingIds.length === 0,
    noContribution: contribution !== null && revenue > 0 && contribution <= 0,
  };
}
