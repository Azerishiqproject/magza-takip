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
const { calculateOrderProfitability: orderCost } = load(resolve("src/lib/order-profitability.ts"));
const categories = [
  { id: "sales", storeId: "s1", name: "Sipariş gelirleri", type: "income" },
  { id: "other", storeId: "s1", name: "Diğer gelir", type: "income" },
  { id: "ads", storeId: "s1", name: "Meta", type: "expense" },
  { id: "ads2", storeId: "s1", name: "Reklam", type: "expense" },
  { id: "stock", storeId: "s1", name: "Mehsul", type: "expense" },
  { id: "shipping", storeId: "s1", name: "Kargo", type: "expense" },
  { id: "fees", storeId: "s1", name: "Paket", type: "expense" },
];
const settings = { advertisingCategoryIds: ["ads"], salesCategoryIds: ["sales"] };
const store = { id: "s1", name: "Store", currency: "AZN", profitSettings: settings };
const products = [
  { id: "main", storeId: "s1", name: "Ana ürün", price: 30, purchasePrice: 7 },
  { id: "corner", storeId: "s1", name: "Künclük", price: 4, purchasePrice: 1.4 },
  { id: "sock", storeId: "s1", name: "Çorap", price: 7, purchasePrice: 1.6 },
];
const tx = (id, categoryId, type, amount, extra = {}) => ({ id, storeId: "s1", categoryId, type, amount, date: "2026-10-27", ...extra });
const order = (id, items = [["main", 1], ["corner", 1], ["sock", 1]], extra = {}) => ({
  id, storeId: "s1", customerName: "Demo", product: "Paket", amount: 40, shippingCost: 1,
  stage: "delivered", status: "completed", createdAt: "2026-10-01T10:00:00Z", completedAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z",
  items: items.map(([productId, quantity]) => ({ productId, quantity, product: products.find(p => p.id === productId)?.name ?? productId })), ...extra,
});
const sale = (id, amount = 40, extra = {}) => tx(`order-income-${id}`, "sales", "income", amount, { orderId: id, ...extra });
const calculateBundle = () => calculate(store, categories, [sale("o1"), tx("ad", "ads", "expense", 10)], [order("o1")], products);

test("40 AZN mixed bundle costs 14 AZN, never 7.48: product costs plus one shipping fee", () => {
  const r = calculateBundle();
  assert.equal(r.revenue, 40); assert.equal(r.purchaseCost, 10); assert.equal(r.shippingCost, 4); assert.equal(r.productCost, 14);
  assert.equal(r.profit, 16); assert.equal(r.roas, 4); assert.equal(r.breakEven, 40 / 26);
  assert.equal(r.orderCount, 1); assert.equal(r.soldUnits, 3); assert.equal(r.costComplete, true);
  assert.equal(r.orderResults[0].contribution, 26); assert.equal(r.orderResults[0].breakEven, 40 / 26);
});

test("each package pays shipping once for one, two or six units", () => {
  for (const quantity of [1, 2, 6]) {
    const r = orderCost(store, order("o1", [["main", quantity]], { amount: 30 * quantity }), products);
    assert.equal(r.purchaseCost, 7 * quantity); assert.equal(r.shippingCost, 4); assert.equal(r.totalCost, 7 * quantity + 4);
  }
});

test("aggregate threshold uses total contribution rather than averaging order ratios", () => {
  const r = calculate(store, categories, [sale("o1"), sale("o2", 60), tx("ad", "ads", "expense", 20)], [order("o1"), order("o2", [["main", 2]], { amount: 60 })], products);
  assert.equal(r.revenue, 100); assert.equal(r.purchaseCost, 24); assert.equal(r.shippingCost, 8); assert.equal(r.productCost, 32);
  assert.equal(r.profit, 48); assert.equal(r.breakEven, 100 / 68); assert.equal(r.orderCount, 2); assert.equal(r.soldUnits, 5);
});

test("changing stock purchase price recalculates historical orders without changing revenue or stored orders", () => {
  const orders = [order("o1")]; const records = [sale("o1"), tx("ad", "ads", "expense", 10)];
  const before = JSON.stringify([orders, records, products]);
  const first = calculate(store, categories, records, orders, products);
  const changed = products.map(p => p.id === "main" ? { ...p, purchasePrice: 9 } : p);
  const next = calculate(store, categories, records, orders, changed);
  assert.equal(next.productCost - first.productCost, 2); assert.equal(first.profit - next.profit, 2);
  assert.equal(next.revenue, first.revenue); assert.equal(next.roas, first.roas); assert.notEqual(next.breakEven, first.breakEven);
  assert.equal(JSON.stringify([orders, records, products]), before);
});

test("purchase cost always comes from stock even if a legacy record has its own cost", () => {
  const o = order("o1"); o.items.forEach(i => { i.unitCost = 999; }); o.unitCost = 999;
  assert.equal(orderCost(store, o, products).totalCost, 14);
});

test("legacy average sale and cost settings no longer influence the calculation", () => {
  const legacy = { ...store, profitSettings: { ...settings, averageUnitCost: 9999, averageSalePrice: 1, estimatedOrderCost: 999, productPurchaseCategoryIds: ["stock"] } };
  assert.deepEqual(calculate(legacy, categories, [sale("o1")], [order("o1")], products), calculate(store, categories, [sale("o1")], [order("o1")], products));
});

test("sale price edits affect neither historical revenue nor purchase cost", () => {
  const changed = products.map(p => ({ ...p, price: 10000 }));
  assert.deepEqual(calculate(store, categories, [sale("o1")], [order("o1")], changed), calculate(store, categories, [sale("o1")], [order("o1")], products));
});

test("only selected financial income supplies revenue, even when order amount differs", () => {
  const r = calculate(store, categories, [sale("o1", 45), tx("other-income", "other", "income", 900, { orderId: "o1" })], [order("o1", undefined, { amount: 999 })], products);
  assert.equal(r.revenue, 45); assert.equal(r.productCost, 14); assert.equal(r.profit, 31); assert.equal(r.orderCount, 1);
});

test("unselected income cannot cause product costs to be charged", () => {
  const r = calculate(store, categories, [sale("o1", 40, { categoryId: "other" })], [order("o1")], products);
  assert.equal(r.revenue, 0); assert.equal(r.productCost, 0); assert.equal(r.orderCount, 0);
});

test("unrelated expenses, stock purchases and recorded cargo are not charged again", () => {
  const records = [sale("o1"), tx("ad", "ads", "expense", 10)];
  const extras = [tx("domain", "fees", "expense", 500), tx("purchase", "stock", "expense", 500), tx("cargo", "shipping", "expense", 500), tx("other-ad", "ads2", "expense", 500)];
  assert.deepEqual(calculate(store, categories, [...records, ...extras], [order("o1")], products), calculate(store, categories, records, [order("o1")], products));
});

test("advertising is chosen by category ID regardless of its name", () => {
  const cats = categories.map(c => c.id === "ads" ? { ...c, name: "Seçilen gider" } : c);
  const r = calculate(store, cats, [sale("o1"), tx("ad", "ads", "expense", 10), tx("other-ad", "ads2", "expense", 500)], [order("o1")], products);
  assert.equal(r.adSpend, 10); assert.equal(r.roas, 4); assert.equal(r.profit, 16);
});

test("additional receipts for the same order charge the package only once", () => {
  const r = calculate(store, categories, [sale("o1", 35), tx("extra", "sales", "income", 5, { orderId: "o1" })], [order("o1")], products);
  assert.equal(r.revenue, 40); assert.equal(r.productCost, 14); assert.equal(r.shippingCost, 4); assert.equal(r.saleRecords, 2); assert.equal(r.orderCount, 1);
});

test("duplicate snapshots cannot duplicate revenue, costs or shipping", () => {
  const s = sale("o1");
  const r = calculate(store, categories, [s, s], [order("o1"), order("o1")], products);
  assert.equal(r.revenue, 40); assert.equal(r.productCost, 14); assert.equal(r.saleRecords, 1); assert.equal(r.orderCount, 1);
});

test("missing purchase prices suppress profit instead of treating unknown costs as zero", () => {
  const r = calculate(store, categories, [sale("o1"), tx("ad", "ads", "expense", 10)], [order("o1")], products.map(p => p.id === "main" ? { ...p, purchasePrice: undefined } : p));
  assert.equal(r.roas, 4); assert.equal(r.profit, null); assert.equal(r.productCost, null); assert.equal(r.breakEven, null);
  assert.equal(r.missingCostOrders, 1); assert.deepEqual(r.missingProducts, ["Ana ürün"]); assert.equal(r.costComplete, false);
});

test("zero purchase prices are valid and shipping is still charged", () => {
  const r = orderCost(store, order("o1"), products.map(p => ({ ...p, purchasePrice: 0 })));
  assert.equal(r.purchaseCost, 0); assert.equal(r.totalCost, 4); assert.equal(r.breakEven, 40 / 36);
});

test("deleted products, foreign store products and invalid quantities cannot create profit", () => {
  for (const ps of [[], products.map(p => ({ ...p, storeId: "foreign" }))]) assert.equal(orderCost(store, order("o1"), ps).totalCost, null);
  for (const q of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(orderCost(store, order("o1", [["main", q]]), products).totalCost, null);
  assert.equal(orderCost(store, order("o1", [["main", Number.MAX_SAFE_INTEGER]]), products).totalCost, null);
});

test("invalid purchase prices are unknown; they cannot produce a negative or fractional-cent cost", () => {
  for (const purchasePrice of [-1, NaN, Infinity, 0.001]) {
    assert.equal(orderCost(store, order("o1"), products.map(p => ({ ...p, purchasePrice }))).totalCost, null);
  }
});

test("legacy linked single-product orders use their explicit quantity or one by default", () => {
  for (const quantity of [undefined, 2]) {
    const o = order("o1", [], { items: undefined, productId: "main", quantity });
    assert.equal(orderCost(store, o, products).totalCost, 7 * (quantity ?? 1) + 4);
  }
  assert.equal(orderCost(store, order("o1", [], { items: undefined, productId: null }), products).totalCost, null);
});

test("unlinked financial revenue is visible but never assigned a guessed product cost", () => {
  const r = calculate(store, categories, [sale("o1"), tx("manual", "sales", "income", 20)], [order("o1")], products);
  assert.equal(r.revenue, 60); assert.equal(r.unmatchedRevenue, 20); assert.equal(r.unmatchedRecords, 1); assert.equal(r.profit, null); assert.equal(r.breakEven, null);
});

test("active, cancelled and foreign orders cannot supply costs for completed sales income", () => {
  for (const extra of [{ status: "active" }, { status: "cancelled" }, { storeId: "s2" }]) {
    const r = calculate(store, categories, [sale("o1")], [order("o1", undefined, extra)], products);
    assert.equal(r.unmatchedRecords, 1); assert.equal(r.profit, null);
  }
});

test("financial period determines which order's cost is included", () => {
  const included = calculate(store, categories, [sale("o1", 40, { date: "2026-11-04" })], [order("o1")], products);
  assert.equal(included.productCost, 14);
  const empty = calculate(store, categories, [], [order("o1")], products);
  assert.equal(empty.revenue, 0); assert.equal(empty.productCost, 0); assert.equal(empty.shippingCost, 0); assert.equal(empty.orderCount, 0);
});

test("no advertising spend yields no ROAS; ads without sales show the loss", () => {
  const noAds = calculate(store, categories, [sale("o1")], [order("o1")], products);
  assert.equal(noAds.roas, null); assert.equal(noAds.profit, 26);
  const noSales = calculate(store, categories, [tx("ad", "ads", "expense", 10)], [order("o1")], products);
  assert.equal(noSales.roas, 0); assert.equal(noSales.profit, -10); assert.equal(noSales.breakEven, null);
});

test("losing bundles retain their full cost instead of capping it to revenue", () => {
  const r = calculate(store, categories, [sale("o1", 1)], [order("o1", undefined, { amount: 1 })], products);
  assert.equal(r.productCost, 14); assert.equal(r.profit, -13); assert.equal(r.breakEven, null); assert.equal(r.noContribution, true);
});

test("currencies are isolated and 4 AZN is not silently converted to USD, EUR or TRY", () => {
  for (const currency of ["USD", "EUR", "TRY"]) {
    const r = orderCost({ ...store, currency }, order("o1", undefined, { shippingCost: 2.5 }), products);
    assert.equal(r.shippingCost, 2.5); assert.equal(r.totalCost, 12.5);
    assert.equal(orderCost({ ...store, currency }, order("o1", undefined, { shippingCost: undefined }), products).totalCost, null);
  }
  const r = calculate(store, categories, [sale("o1"), tx("foreign", "sales", "income", 999, { storeId: "s2" })], [order("o1")], products);
  assert.equal(r.revenue, 40);
});

test("invalid dates and amounts are excluded from revenue and advertising", () => {
  const extra = [tx("bad-date", "sales", "income", 10, { date: "2026-02-31" }), tx("nan", "ads", "expense", NaN), tx("infinite", "ads", "expense", Infinity), tx("negative", "sales", "income", -1)];
  assert.deepEqual(calculate(store, categories, [sale("o1"), ...extra], [order("o1")], products), calculate(store, categories, [sale("o1")], [order("o1")], products));
});

test("integer cents avoid rounding drift in multi-item costs", () => {
  const ps = [{ ...products[0], purchasePrice: 0.1 }, { ...products[1], purchasePrice: 0.2 }];
  const r = orderCost(store, order("o1", [["main", 3], ["corner", 3]]), ps);
  assert.equal(r.purchaseCost, 0.9); assert.equal(r.totalCost, 4.9);
});

test("settings require category choices but no longer require average prices", () => {
  assert.doesNotThrow(() => validateProfitSettings(settings, "s1", categories));
  assert.doesNotThrow(() => validateProfitSettings({ ...settings, averageUnitCost: 12, averageSalePrice: 31 }, "s1", categories));
  for (const edit of [{ advertisingCategoryIds: [] }, { advertisingCategoryIds: ["sales"] }, { advertisingCategoryIds: ["foreign"] }, { salesCategoryIds: [] }, { salesCategoryIds: ["ads"] }]) assert.throws(() => validateProfitSettings({ ...settings, ...edit }, "s1", categories));
  assert.deepEqual(suggestedProfitCategories("s1", categories), { advertisingCategoryIds: [], salesCategoryIds: ["sales"] });
});

test("newly created order income categories remain available after setup", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, salesCategoryIds: [] } }, categories, [sale("o1")], [order("o1")], products);
  assert.equal(r.revenue, 40); assert.equal(r.productCost, 14); assert.equal(r.noSalesCategory, false);
});

test("missing/retyped source categories cannot silently supply ROAS or profit", () => {
  const r = calculate(store, categories.filter(c => c.id !== "ads"), [sale("o1"), tx("ad", "ads", "expense", 10)], [order("o1")], products);
  assert.equal(r.noAdvertisingCategory, true); assert.equal(r.roas, null); assert.equal(r.profit, null);
  const missingSales = calculate(store, categories.filter(c => c.id !== "sales"), [sale("o1")], [order("o1")], products);
  assert.equal(missingSales.noSalesCategory, true); assert.equal(missingSales.revenue, 0);
});

test("break even requires positive contribution", () => {
  assert.equal(breakEvenRoas(40, 14), 40 / 26); assert.equal(breakEvenRoas(30, 11), 30 / 19);
  assert.equal(breakEvenRoas(10, 10), null); assert.equal(breakEvenRoas(10, 11), null); assert.equal(breakEvenRoas(0, 0), null);
});
