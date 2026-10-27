import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} }; cache.set(file, loadedModule);
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)((id) => id.startsWith(".") ? load(resolve(dirname(file), `${id}.ts`)) : require(id), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { calculateProfitability: calculate, breakEvenRoas, suggestedProfitCategories, validateProfitSettings } = load(resolve("src/lib/profitability.ts"));
const categories = [
  { id: "sales", storeId: "s1", name: "Sipariş gelirleri", type: "income" },
  { id: "other", storeId: "s1", name: "Diğer gelir", type: "income" },
  { id: "ads", storeId: "s1", name: "Meta", type: "expense" },
  { id: "ads2", storeId: "s1", name: "Reklam", type: "expense" },
  { id: "stock", storeId: "s1", name: "Mehsul", type: "expense" },
  { id: "shipping", storeId: "s1", name: "Kargo", type: "expense" },
  { id: "fees", storeId: "s1", name: "Paket", type: "expense" },
];
const settings = { averageUnitCost: 12, averageSalePrice: 45, advertisingCategoryIds: ["ads"], productPurchaseCategoryIds: ["stock"], salesCategoryIds: ["sales"] };
const store = { id: "s1", name: "Store", currency: "AZN", profitSettings: settings };
const tx = (id, categoryId, type, amount, extra = {}) => ({ id, storeId: "s1", categoryId, type, amount, date: "2026-10-27", ...extra });
const records = [tx("sale", "sales", "income", 450), tx("ad", "ads", "expense", 100), tx("ship", "shipping", "expense", 40), tx("fee", "fees", "expense", 20)];

test("profit uses the selected income total and user-entered average cost ratio", () => {
  const result = calculate(store, categories, records);
  assert.equal(result.revenue, 450); assert.equal(result.productCost, 120);
  assert.equal(result.profit, 210); assert.equal(result.adSpend, 100);
  assert.equal(result.roas, 4.5); assert.equal(result.breakEven, 450 / 310);
  assert.equal(result.plannedBreakEven, 45 / 33);
});
test("order links never bypass the chosen income category or add a second revenue source", () => {
  const r = calculate(store, categories, [...records, tx("extra", "other", "income", 900, { orderId: "o1" })]);
  assert.equal(r.revenue, 450); assert.equal(r.otherIncome, 900); assert.equal(r.productCost, 120);
});
test("advertising is chosen by category ID rather than category name", () => {
  const r = calculate(store, categories, [...records, tx("not-selected", "ads2", "expense", 50)]);
  assert.equal(r.adSpend, 100); assert.equal(r.roas, 4.5); assert.equal(r.otherExpenses, 70); assert.equal(r.profit, 160);
});
test("multiple advertising categories are added together", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, advertisingCategoryIds: ["ads", "ads2"] } }, categories, [...records, tx("ad2", "ads2", "expense", 50)]);
  assert.equal(r.adSpend, 150); assert.equal(r.roas, 3); assert.equal(r.profit, 160);
});
test("inventory purchases are replaced by the cost share, not charged twice", () => {
  const r = calculate(store, categories, [...records, tx("stock-payment", "stock", "expense", 2000)]);
  assert.equal(r.purchases, 2000); assert.equal(r.productCost, 120); assert.equal(r.profit, 210);
});
test("changing the average selling price updates the ratio without using unit counts", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, averageSalePrice: 60 } }, categories, records);
  assert.equal(r.productCost, 90); assert.equal(r.profit, 240);
});
test("zero cost is allowed and is different from missing configuration", () => {
  const free = calculate({ ...store, profitSettings: { ...settings, averageUnitCost: 0 } }, categories, records);
  assert.equal(free.productCost, 0); assert.equal(free.profit, 330);
  const unset = calculate({ ...store, profitSettings: undefined }, categories, records);
  assert.equal(unset.productCost, null); assert.equal(unset.profit, null); assert.equal(unset.breakEven, null);
});
test("no advertising expense produces no ROAS instead of infinity", () => {
  const r = calculate(store, categories, [records[0]]);
  assert.equal(r.roas, null); assert.equal(r.profit, 330); assert.equal(r.breakEven, 450 / 330);
});
test("advertising without revenue is a loss with zero ROAS", () => {
  const r = calculate(store, categories, [records[1]]);
  assert.equal(r.profit, -100); assert.equal(r.roas, 0); assert.equal(r.breakEven, null);
});
test("costs at or above income have no finite break-even ROAS", () => {
  for (const cost of [45, 60]) {
    const r = calculate({ ...store, profitSettings: { ...settings, averageUnitCost: cost } }, categories, records);
    assert.equal(r.breakEven, null); assert.equal(r.noContribution, true); assert.equal(r.plannedBreakEven, null);
    assert.ok(r.profit < 0);
  }
  assert.equal(breakEvenRoas(0, 0), null);
});
test("one snapshot document is counted once, separate documents are preserved", () => {
  const r = calculate(store, categories, [...records, records[0], { ...records[0], id: "second-real-sale" }]);
  assert.equal(r.revenue, 900); assert.equal(r.saleRecords, 2); assert.equal(r.productCost, 240);
});
test("the cost ratio rounds once on the aggregate category income", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, averageUnitCost: 1, averageSalePrice: 3 } }, categories, [tx("a", "sales", "income", 0.01), tx("b", "sales", "income", 0.01), tx("c", "sales", "income", 0.01)]);
  assert.equal(r.revenue, 0.03); assert.equal(r.productCost, 0.01); assert.equal(r.profit, 0.02);
});
test("other stores and currencies never affect this store", () => {
  const r = calculate(store, categories, [...records, tx("foreign", "sales", "income", 10000, { storeId: "s2" })]);
  assert.equal(r.revenue, 450); assert.equal(r.profit, 210);
});
test("invalid dates, negative amounts and nonfinite amounts are excluded", () => {
  const r = calculate(store, categories, [...records, tx("bad-date", "sales", "income", 100, { date: "2026-02-31" }), tx("negative", "sales", "income", -100), tx("nan", "sales", "income", NaN), tx("infinite", "sales", "income", Infinity)]);
  assert.equal(r.revenue, 450); assert.equal(r.profit, 210);
});
test("a category created after setup can become the default order income source", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, salesCategoryIds: [] } }, categories, records);
  assert.equal(r.revenue, 450); assert.equal(r.noSalesCategory, false);
});
test("unavailable or retyped categories do not silently supply ROAS", () => {
  const r = calculate(store, categories.filter(c => c.id !== "ads" && c.id !== "sales"), records);
  assert.equal(r.noSalesCategory, true); assert.equal(r.noAdvertisingCategory, true); assert.equal(r.roas, null); assert.equal(r.breakEven, null);
});
test("advertising selection starts empty; order revenue is the suggested income", () => {
  const roles = suggestedProfitCategories("s1", categories);
  assert.deepEqual(roles.advertisingCategoryIds, []); assert.deepEqual(roles.salesCategoryIds, ["sales"]); assert.deepEqual(roles.productPurchaseCategoryIds, ["stock"]);
});
test("settings reject invalid prices, costs and cross-store categories", () => {
  assert.doesNotThrow(() => validateProfitSettings(settings, "s1", categories));
  for (const edit of [{ averageSalePrice: 0 }, { averageSalePrice: 0.001 }, { averageUnitCost: -1 }, { averageUnitCost: NaN }, { advertisingCategoryIds: [] }, { advertisingCategoryIds: ["sales"] }, { advertisingCategoryIds: ["foreign"] }, { salesCategoryIds: [] }, { productPurchaseCategoryIds: ["ads"] }]) {
    assert.throws(() => validateProfitSettings({ ...settings, ...edit }, "s1", categories));
  }
  assert.throws(() => validateProfitSettings(settings, "s2", categories));
});

test("shipping is included in the entered cost and is never charged twice", () => {
  const before = JSON.stringify(records);
  const r = calculate(store, categories, records);
  assert.equal(r.productCost, 120);
  assert.equal(r.includedShipping, 40);
  assert.equal(r.otherExpenses, 20);
  assert.equal(r.profit, 210);
  assert.equal(r.plannedBreakEven, 45 / 33);
  assert.equal(JSON.stringify(records), before, "original financial records are unchanged");
});

test("automatic shipping stays included after recategorization; manual Karqo is included too", () => {
  const cats = [...categories, { id: "cargo", storeId: "s1", name: "Karqo xərcləri", type: "expense" }];
  const r = calculate(store, cats, [...records,
    tx("order-shipping-o1", "fees", "expense", 25, { orderId: "o1" }),
    tx("manual-cargo", "cargo", "expense", 10),
  ]);
  assert.equal(r.includedShipping, 75);
  assert.equal(r.otherExpenses, 20);
  assert.equal(r.profit, 210);
});

test("previously saved separate shipping estimates are ignored", () => {
  const legacy = { ...settings, estimatedOrderCost: 999 };
  assert.doesNotThrow(() => validateProfitSettings(legacy, "s1", categories));
  assert.deepEqual(calculate({ ...store, profitSettings: legacy }, categories, records), calculate(store, categories, records));
});
