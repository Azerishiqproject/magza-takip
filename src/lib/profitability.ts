import { validReportDate } from "./store-analytics";
import type { Category, ProfitSettings, Store, Transaction } from "./types";

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const validCost = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(cents(value));
const validMoney = (value: unknown): value is number => validCost(value) && Math.abs(value - cents(value) / 100) < 1e-8;
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ə/g, "e");

export function suggestedProfitCategories(storeId: string, categories: Category[]) {
  const own = categories.filter((c) => c.storeId === storeId);
  return {
    advertisingCategoryIds: [] as string[],
    productPurchaseCategoryIds: own.filter((c) => c.type === "expense" && /urun|mehsul|tedarik|product|inventory/.test(normalize(c.name))).map((c) => c.id),
    salesCategoryIds: own.filter((c) => c.type === "income" && /siparis gelir|order income/.test(normalize(c.name))).map((c) => c.id),
  };
}

export function validateProfitSettings(settings: ProfitSettings, storeId: string, categories: Category[]) {
  if (!settings || !validMoney(settings.averageUnitCost) || !validMoney(settings.averageSalePrice) || settings.averageSalePrice < 0.01) throw new Error("Ortalama satış fiyatı en az 0,01; kargo dahil maliyet sıfır veya pozitif ve en fazla iki ondalık basamaklı olmalıdır.");
  const fields = ["advertisingCategoryIds", "productPurchaseCategoryIds", "salesCategoryIds"] as const;
  for (const field of fields) {
    if (!Array.isArray(settings[field]) || settings[field].some((id) => !categories.some((c) => c.id === id && c.storeId === storeId && c.type === (field === "salesCategoryIds" ? "income" : "expense")))) throw new Error("Bu mağazaya ait geçerli kategoriler seçin.");
  }
  if (!settings.advertisingCategoryIds.length) throw new Error("Reklam gideri için en az bir kategori seçin.");
  if (!settings.salesCategoryIds.length && categories.some((c) => c.storeId === storeId && c.type === "income")) throw new Error("Satış gelirinin hesaplanacağı kategoriyi seçin.");
  if (settings.advertisingCategoryIds.some((id) => settings.productPurchaseCategoryIds.includes(id))) throw new Error("Bir kategori hem reklam hem stok alımı olamaz.");
}

export function breakEvenRoas(salePrice: number, cost: number): number | null {
  return validCost(salePrice) && salePrice >= 0.01 && validCost(cost) && cents(salePrice) > cents(cost) ? cents(salePrice) / (cents(salePrice) - cents(cost)) : null;
}

export type Profitability = ReturnType<typeof calculateProfitability>;

// Only selected income categories supply revenue. Order counts, quantities and
// product prices never participate in this store-level average-cost model.
export function calculateProfitability(store: Store, categories: Category[], transactions: Transaction[]) {
  const settings = store.profitSettings;
  const roles = settings ?? suggestedProfitCategories(store.id, categories);
  const categoryMap = new Map(categories.filter((c) => c.storeId === store.id).map((c) => [c.id, c]));
  // A store configured before its first sale gets its auto-created order income
  // category when that category becomes available. Explicit selections are kept.
  const salesIds = (roles.salesCategoryIds.length ? roles.salesCategoryIds : suggestedProfitCategories(store.id, categories).salesCategoryIds).filter((id) => categoryMap.get(id)?.type === "income");
  const advertisingIds = roles.advertisingCategoryIds.filter((id) => categoryMap.get(id)?.type === "expense");
  const records = [...new Map(transactions.filter((t) => t.storeId === store.id && validReportDate(t.date) && validCost(t.amount) && t.amount > 0 && ["income", "expense"].includes(t.type)).map((t) => [t.id, t])).values()];
  let revenue = 0, adSpend = 0, purchases = 0, includedShipping = 0, otherExpenses = 0, otherIncome = 0, saleRecords = 0;
  for (const record of records) {
    const amount = cents(record.amount);
    const category = categoryMap.get(record.categoryId);
    if (record.type === "expense") {
      // The user-entered unit cost already includes shipping. Keep the original
      // ledger untouched, but never subtract its shipping entries a second time.
      const shipping = (record.orderId && record.id === `order-shipping-${record.orderId}`)
        || record.categoryId === `${store.id}-shipping-expense`
        || (category?.type === "expense" && /kargo|karqo|shipping|nakliye|teslimat|delivery|lojistik|logistik|kurye|kuryer/.test(normalize(category.name)));
      if (shipping) includedShipping += amount;
      else if (category?.type === "expense" && roles.productPurchaseCategoryIds.includes(record.categoryId)) purchases += amount;
      else if (category?.type === "expense" && advertisingIds.includes(record.categoryId)) adSpend += amount;
      else otherExpenses += amount;
    } else if (category?.type === "income" && salesIds.includes(record.categoryId)) {
      revenue += amount; saleRecords++;
    } else otherIncome += amount;
  }
  const configured = Boolean(settings && validMoney(settings.averageUnitCost) && validMoney(settings.averageSalePrice) && settings.averageSalePrice >= 0.01);
  // Round once after applying the cost ratio to the entire income total.
  const productCost = configured ? Math.round(revenue * cents(settings!.averageUnitCost) / cents(settings!.averageSalePrice)) : null;
  const contribution = productCost === null ? null : revenue - productCost - otherExpenses;
  return {
    revenue: revenue / 100, adSpend: adSpend / 100, productCost: productCost === null ? null : productCost / 100,
    otherExpenses: otherExpenses / 100, purchases: purchases / 100, includedShipping: includedShipping / 100, otherIncome: otherIncome / 100,
    profit: contribution === null ? null : (contribution - adSpend) / 100,
    roas: adSpend > 0 ? revenue / adSpend : null,
    breakEven: advertisingIds.length > 0 && contribution !== null && revenue > 0 && contribution > 0 ? revenue / contribution : null,
    plannedBreakEven: configured ? breakEvenRoas(settings!.averageSalePrice, settings!.averageUnitCost) : null,
    saleRecords, configured, noSalesCategory: salesIds.length === 0, noAdvertisingCategory: advertisingIds.length === 0,
    noContribution: contribution !== null && revenue > 0 && contribution <= 0,
  };
}
