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
const settings = { averageUnitCost: 12, averageSalePrice: 45, advertisingCategoryIds: ["ads"], salesCategoryIds: ["sales"] };
const store = { id: "s1", name: "Store", currency: "AZN", profitSettings: settings };
const tx = (id, categoryId, type, amount, extra = {}) => ({ id, storeId: "s1", categoryId, type, amount, date: "2026-10-27", ...extra });
const records = [tx("sale", "sales", "income", 450), tx("ad", "ads", "expense", 100), tx("ship", "shipping", "expense", 40), tx("fee", "fees", "expense", 20)];

test("profit uses the selected income total and user-entered average cost ratio", () => {
  const result = calculate(store, categories, records);
  assert.equal(result.revenue, 450); assert.equal(result.productCost, 120);
  assert.equal(result.profit, 230); assert.equal(result.adSpend, 100);
  assert.equal(result.roas, 4.5); assert.equal(result.breakEven, 450 / 330);
});
test("order links never bypass the chosen income category or add a second revenue source", () => {
  const r = calculate(store, categories, [...records, tx("extra", "other", "income", 900, { orderId: "o1" })]);
  assert.equal(r.revenue, 450); assert.equal(r.productCost, 120);
});
test("advertising is chosen by category ID rather than category name", () => {
  const r = calculate(store, categories, [...records, tx("not-selected", "ads2", "expense", 50)]);
  assert.equal(r.adSpend, 100); assert.equal(r.roas, 4.5); assert.equal(r.profit, 230);
});
test("multiple advertising categories are added together", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, advertisingCategoryIds: ["ads", "ads2"] } }, categories, [...records, tx("ad2", "ads2", "expense", 50)]);
  assert.equal(r.adSpend, 150); assert.equal(r.roas, 3); assert.equal(r.profit, 180);
});
test("inventory purchases are replaced by the cost share, not charged twice", () => {
  const r = calculate(store, categories, [...records, tx("stock-payment", "stock", "expense", 2000)]);
  assert.equal(r.productCost, 120); assert.equal(r.profit, 230);
});
test("changing the average selling price updates the ratio without using unit counts", () => {
  const r = calculate({ ...store, profitSettings: { ...settings, averageSalePrice: 60 } }, categories, records);
  assert.equal(r.productCost, 90); assert.equal(r.profit, 260);
});
test("zero cost is allowed and is different from missing configuration", () => {
  const free = calculate({ ...store, profitSettings: { ...settings, averageUnitCost: 0 } }, categories, records);
  assert.equal(free.productCost, 0); assert.equal(free.profit, 350);
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
    assert.equal(r.breakEven, null); assert.equal(r.noContribution, true);
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
  assert.equal(r.revenue, 450); assert.equal(r.profit, 230);
});
test("invalid dates, negative amounts and nonfinite amounts are excluded", () => {
  const r = calculate(store, categories, [...records, tx("bad-date", "sales", "income", 100, { date: "2026-02-31" }), tx("negative", "sales", "income", -100), tx("nan", "sales", "income", NaN), tx("infinite", "sales", "income", Infinity)]);
  assert.equal(r.revenue, 450); assert.equal(r.profit, 230);
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
  assert.deepEqual(roles.advertisingCategoryIds, []); assert.deepEqual(roles.salesCategoryIds, ["sales"]);
});
test("settings reject invalid prices, costs and cross-store categories", () => {
  assert.doesNotThrow(() => validateProfitSettings(settings, "s1", categories));
  for (const edit of [{ averageSalePrice: 0 }, { averageSalePrice: 0.001 }, { averageUnitCost: -1 }, { averageUnitCost: NaN }, { advertisingCategoryIds: [] }, { advertisingCategoryIds: ["sales"] }, { advertisingCategoryIds: ["foreign"] }, { salesCategoryIds: [] }]) {
    assert.throws(() => validateProfitSettings({ ...settings, ...edit }, "s1", categories));
  }
  assert.throws(() => validateProfitSettings(settings, "s2", categories));
});

test("unselected shipping and packaging expenses do not affect ROAS or product profit", () => {
  const before = JSON.stringify(records);
  assert.deepEqual(calculate(store, categories, records), calculate(store, categories, records.slice(0, 2)));
  assert.equal(JSON.stringify(records), before, "original financial records are unchanged");
});

test("automatic shipping and manual Karqo records have no effect on the model", () => {
  const cats = [...categories, { id: "cargo", storeId: "s1", name: "Karqo xərcləri", type: "expense" }];
  const r = calculate(store, cats, [...records,
    tx("order-shipping-o1", "fees", "expense", 25, { orderId: "o1" }),
    tx("manual-cargo", "cargo", "expense", 10),
  ]);
  assert.deepEqual(r, calculate(store, cats, records));
});

test("previously saved separate shipping estimates are ignored", () => {
  const legacy = { ...settings, estimatedOrderCost: 999 };
  assert.doesNotThrow(() => validateProfitSettings(legacy, "s1", categories));
  assert.deepEqual(calculate({ ...store, profitSettings: legacy }, categories, records), calculate(store, categories, records));
});


test("all unrelated expenses and legacy purchase mappings are ignored", () => {
  const unrelated = [tx("domain", "fees", "expense", 9999), tx("stock-buy", "stock", "expense", 5000), tx("not-selected-ads", "ads2", "expense", 2000)];
  const legacy = { ...store, profitSettings: { ...settings, productPurchaseCategoryIds: ["ads", "stock"] } };
  assert.deepEqual(calculate(legacy, categories, [...records, ...unrelated]), calculate(store, categories, records));
});

test("only the user's selected advertising IDs determine ad spend, regardless of category names", () => {
  const cats = categories.map(c => c.id === "ads" ? { ...c, name: "Kargo ve reklam" } : c);
  const r = calculate(store, cats, records);
  assert.equal(r.adSpend, 100); assert.equal(r.profit, 230); assert.equal(r.roas, 4.5);
});

const bundle = (id, quantities = [1, 1], extra = {}) => ({
  id, storeId: "s1", status: "completed", customerName: "Demo", product: "Paket", amount: 90, stage: "delivered",
  createdAt: "2026-10-01T10:00:00Z", completedAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z",
  items: quantities.map((quantity, i) => ({ productId: `p${i}`, product: `Ürün ${i}`, quantity, unitPrice: 45 })), ...extra,
});
const bundleSale = (id, amount = 90, extra = {}) => tx(`order-income-${id}`, "sales", "income", amount, { orderId: id, ...extra });

test("two units share one shipping fee: deduct 4 AZN from estimated cost, not revenue or ad spend", () => {
  const r = calculate(store, categories, [bundleSale("o1"), tx("ad", "ads", "expense", 20)], [bundle("o1")]);
  assert.equal(r.revenue, 90); assert.equal(r.baseProductCost, 24); assert.equal(r.shippingSavings, 4); assert.equal(r.productCost, 20);
  assert.equal(r.profit, 50); assert.equal(r.adSpend, 20); assert.equal(r.roas, 4.5); assert.equal(r.breakEven, 90 / 70);
  assert.equal(r.bundleOrders, 1); assert.equal(r.extraBundleUnits, 1);
});

test("three units of the same product save 8 AZN; mixed lines use unit quantities rather than row count", () => {
  for (const quantities of [[3], [2, 1], [1, 1, 1]]) {
    const r = calculate(store, categories, [bundleSale("o1", 135)], [bundle("o1", quantities, { quantity: 999 })]);
    assert.equal(r.baseProductCost, 36); assert.equal(r.shippingSavings, 8); assert.equal(r.productCost, 28); assert.equal(r.profit, 107);
    assert.equal(r.extraBundleUnits, 2);
  }
});

test("single-unit orders and unrelated manual income do not receive bundle credits", () => {
  const r = calculate(store, categories, [bundleSale("single", 45), tx("manual", "sales", "income", 90)], [bundle("single", [1])]);
  assert.equal(r.shippingSavings, 0); assert.equal(r.bundleOrders, 0); assert.equal(r.productCost, 36);
});

test("active and cancelled orders never receive shipping savings", () => {
  for (const status of ["active", "cancelled"]) {
    const r = calculate(store, categories, [bundleSale("o1")], [bundle("o1", [2], { status })]);
    assert.equal(r.shippingSavings, 0); assert.equal(r.productCost, 24);
  }
});

test("bundle adjustment follows the selected finance period, not the order creation/completion date", () => {
  const order = bundle("o1");
  const income = bundleSale("o1", 90, { date: "2026-11-04" });
  const included = calculate(store, categories, [income], [order]);
  assert.equal(included.shippingSavings, 4);
  const excluded = calculate(store, categories, [], [order]);
  assert.equal(excluded.shippingSavings, 0); assert.equal(excluded.productCost, 0); assert.equal(excluded.revenue, 0);
});

test("only the selected order-income category can claim an order's shipping saving", () => {
  const r = calculate(store, categories, [bundleSale("o1", 90, { categoryId: "other" }), tx("manual", "sales", "income", 90)], [bundle("o1")]);
  assert.equal(r.revenue, 90); assert.equal(r.shippingSavings, 0); assert.equal(r.productCost, 24);
});

test("additional receipts and duplicate snapshots cannot apply the same package saving twice", () => {
  const sale = bundleSale("o1");
  const duplicate = calculate(store, categories, [sale, sale], [bundle("o1"), bundle("o1")]);
  assert.equal(duplicate.revenue, 90); assert.equal(duplicate.shippingSavings, 4);
  const extraReceipt = calculate(store, categories, [sale, tx("manual-extra", "sales", "income", 90, { orderId: "o1" })], [bundle("o1")]);
  assert.equal(extraReceipt.revenue, 180); assert.equal(extraReceipt.baseProductCost, 48); assert.equal(extraReceipt.shippingSavings, 4); assert.equal(extraReceipt.productCost, 44);
});

test("missing or foreign-store orders are not used to infer a package saving", () => {
  for (const orders of [[], [bundle("o1", [2], { storeId: "s2" })]]) {
    const r = calculate(store, categories, [bundleSale("o1")], orders);
    assert.equal(r.shippingSavings, 0); assert.equal(r.productCost, 24);
  }
});

test("4 AZN shipping is never silently treated as 4 USD, EUR or TRY", () => {
  for (const currency of ["USD", "EUR", "TRY"]) {
    const r = calculate({ ...store, currency }, categories, [bundleSale("o1")], [bundle("o1")]);
    assert.equal(r.shippingSavings, 0); assert.equal(r.productCost, 24);
  }
});

test("invalid or unknown quantities never create a shipping credit", () => {
  for (const quantities of [[0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [Number.MAX_SAFE_INTEGER, 1]]) {
    assert.equal(calculate(store, categories, [bundleSale("o1")], [bundle("o1", quantities)]).shippingSavings, 0);
  }
  const legacy = bundle("o1", [], { items: undefined, productId: null, product: "3 ürün olabilir" });
  assert.equal(calculate(store, categories, [bundleSale("o1")], [legacy]).shippingSavings, 0);
});

test("legacy single-product orders with explicit quantity are supported", () => {
  for (const productId of ["p1", null]) {
    const legacy = bundle("o1", [], { items: undefined, productId, quantity: 2 });
    assert.equal(calculate(store, categories, [bundleSale("o1")], [legacy]).shippingSavings, 4);
  }
});

test("a deeply discounted bundle cannot produce negative costs or consume other sales' costs", () => {
  const r = calculate(store, categories, [bundleSale("o1", 1), tx("normal-sale", "sales", "income", 450)], [bundle("o1", [100])]);
  assert.equal(r.baseProductCost, 120.27); assert.equal(r.shippingSavings, 0.27); assert.equal(r.productCost, 120);
  const free = calculate({ ...store, profitSettings: { ...settings, averageUnitCost: 0 } }, categories, [bundleSale("o1")], [bundle("o1")]);
  assert.equal(free.productCost, 0); assert.equal(free.shippingSavings, 0);
});

test("bundle adjustment leaves stored orders and financial records unchanged and ignores actual shipping charges", () => {
  const order = bundle("o1", [2], { amount: 999, shippingCost: 40 });
  const sale = bundleSale("o1"); const before = JSON.stringify([order, sale]);
  const r = calculate(store, categories, [sale, tx("shipping", "shipping", "expense", 40)], [order]);
  assert.equal(r.revenue, 90); assert.equal(r.shippingSavings, 4); assert.equal(r.productCost, 20);
  assert.equal(JSON.stringify([order, sale]), before);
});
