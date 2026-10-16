import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const loaded = { exports: {} };
const filename = resolve("src/lib/store-analytics.ts");
const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInThisContext(`(function(require, module, exports) { ${source}\n})`, { filename })(require, loaded, loaded.exports);
const { buildStoreReports, getReportRange, scopedReportStores, reportCategoryOptions, validReportDate, buildSalesReport, orderCreatedDate, matchesSalesStatus } = loaded.exports;
const store = (id, currency = "AZN", folderId = null, status = "active") => ({ id, name: `Mağaza ${id}`, currency, folderId, status, domain: `${id}.example.com`, color: "#2dd4bf" });
const stores = [store("a", "AZN", "f1"), store("b", "AZN", "f1", "paused"), store("c", "AZN", "f2"), store("d", "USD"), store("e", "EUR", "deleted")];
const folders = [{ id: "f1", name: "Birinci" }, { id: "f2", name: "İkinci" }];
const categories = [
  { id: "a-income", storeId: "a", name: "Sipariş gelirleri", type: "income" },
  { id: "b-income", storeId: "b", name: "Sipariş gelirleri", type: "income" },
  { id: "a-ads", storeId: "a", name: "Reklam", type: "expense" },
  { id: "b-ads", storeId: "b", name: " reklam ", type: "expense" },
];
const transaction = (id, storeId, type, amount, categoryId, date = "2026-10-10") => ({ id, storeId, type, amount, categoryId, date, title: id });
const transactions = [
  transaction("a1", "a", "income", 100, "a-income"), transaction("a2", "a", "expense", 30, "a-ads"),
  transaction("b1", "b", "income", 50, "b-income"), transaction("b2", "b", "expense", 80, "b-ads"),
  transaction("c1", "c", "income", 70, "missing", "2026-10-11"), transaction("c2", "c", "expense", 5, "missing", "2026-10-11"),
  transaction("d1", "d", "income", 200, "missing"), transaction("d2", "d", "expense", 40, "missing"),
  transaction("old", "a", "income", 900, "a-income", "2026-10-09"), transaction("future", "a", "income", 800, "a-income", "2026-10-20"),
];
const range = { start: "2026-10-10", end: "2026-10-11", error: null };
const report = (selected = stores, records = transactions, category = "all") => buildStoreReports(selected, categories, records, range, category);

test("all-store totals, timelines and tables reconcile within each currency", () => {
  const groups = report(); const azn = groups.find((item) => item.currency === "AZN"); const usd = groups.find((item) => item.currency === "USD");
  assert.equal(groups.length, 3);
  assert.equal(azn.income, 220); assert.equal(azn.expense, 115); assert.equal(azn.profit, 105); assert.equal(azn.count, 6);
  assert.equal(usd.income, 200); assert.equal(usd.expense, 40); assert.equal(usd.profit, 160);
  for (const group of groups) for (const key of ["income", "expense", "profit", "count"]) {
    assert.equal(group.timeline.reduce((sum, point) => sum + point[key], 0), group[key]);
    assert.equal(group.byStore.reduce((sum, point) => sum + point[key], 0), group[key]);
    assert.equal(group.byCategory.reduce((sum, point) => sum + point[key], 0), group[key]);
  }
});

test("folder scopes include exactly their own stores; deleted-folder stores are ungrouped", () => {
  assert.deepEqual(scopedReportStores(stores, folders, "folder:f1", "all").map((item) => item.id), ["a", "b"]);
  assert.deepEqual(scopedReportStores(stores, folders, "ungrouped", "all").map((item) => item.id), ["d", "e"]);
  const group = report(scopedReportStores(stores, folders, "folder:f1", "all"))[0];
  assert.equal(group.income, 150); assert.equal(group.expense, 110); assert.equal(group.profit, 40);
  assert.deepEqual(scopedReportStores(stores, folders, "folder:missing", "all"), []);
  assert.deepEqual(scopedReportStores(stores, folders, "store:b", "all").map((item) => item.id), ["b"]);
  assert.deepEqual(scopedReportStores(stores, folders, "store:b", "active"), []);
  assert.deepEqual(scopedReportStores(stores, folders, "store:missing", "all"), []);
});

test("store exclusion and paused/active filtering change all totals consistently", () => {
  const active = scopedReportStores(stores, folders, "folder:f1", "active");
  assert.deepEqual(active.map((item) => item.id), ["a"]); assert.equal(report(active)[0].profit, 70);
  const paused = scopedReportStores(stores, folders, "all", "paused");
  assert.equal(report(paused)[0].profit, -30);
  assert.equal(report(stores.filter((item) => item.id === "b" || item.id === "c"))[0].profit, 35);
  assert.deepEqual(report([]), []);
});

test("same-name categories from different stores merge, while income and expense remain distinct", () => {
  const groups = report(); const azn = groups.find((item) => item.currency === "AZN");
  const sales = azn.byCategory.find((item) => item.label === "Sipariş gelirleri");
  const ads = azn.byCategory.find((item) => item.id === JSON.stringify(["expense", "reklam"]));
  assert.equal(sales.income, 150); assert.equal(sales.count, 2); assert.equal(ads.expense, 110); assert.equal(ads.profit, -110);
  const extraCategories = [...categories, { id: "a-ads-income", storeId: "a", name: "Reklam", type: "income" }];
  const options = reportCategoryOptions(stores, extraCategories, [...transactions, transaction("ad-income", "a", "income", 20, "a-ads-income")]);
  assert.equal(options.filter((item) => item.name.trim().toLocaleLowerCase("tr-TR") === "reklam").length, 2);
});

test("category selection applies to totals and every chart/table breakdown", () => {
  const group = report(stores, transactions, JSON.stringify(["expense", "reklam"]))[0];
  assert.equal(group.income, 0); assert.equal(group.expense, 110); assert.equal(group.profit, -110); assert.equal(group.count, 2);
  assert.equal(group.byCategory.length, 1); assert.equal(group.timeline[0].profit, -110);
  assert.equal(group.byStore.find((item) => item.id === "c").profit, 0);
  const income = report(stores, transactions, JSON.stringify(["income", "sipariş gelirleri"]))[0];
  assert.equal(income.income, 150); assert.equal(income.expense, 0); assert.equal(income.profit, 150);
});

test("missing categories and category IDs from other stores cannot leak into another store's category", () => {
  const records = [transaction("missing", "a", "expense", 5, "deleted"), transaction("foreign", "a", "expense", 10, "b-ads")];
  const group = report([stores[0]], records)[0];
  assert.equal(group.byCategory.length, 1); assert.equal(group.byCategory[0].label, "Kategorisiz"); assert.equal(group.expense, 15);
  assert.ok(reportCategoryOptions([stores[0]], categories, records).some((item) => item.key === JSON.stringify(["expense", "kategorisiz"])));
});

test("date boundaries are inclusive and days without transactions stay at zero", () => {
  const result = buildStoreReports([stores[0]], categories, transactions, { start: "2026-10-09", end: "2026-10-12", error: null })[0];
  assert.equal(result.timeline.length, 4); assert.equal(result.income, 1000); assert.equal(result.expense, 30);
  assert.equal(result.timeline[0].income, 900); assert.equal(result.timeline[3].count, 0);
  assert.equal(result.timeline[3].profit, 0);
});

test("long ranges use monthly then annual buckets without losing totals", () => {
  const monthly = buildStoreReports([stores[0]], categories, transactions, { start: "2026-01-01", end: "2026-12-31", error: null })[0];
  assert.equal(monthly.granularity, "month"); assert.equal(monthly.timeline.length, 12); assert.equal(monthly.timeline[9].income, 1800);
  const annual = buildStoreReports([stores[0]], categories, transactions, { start: "2020-01-01", end: "2026-12-31", error: null })[0];
  assert.equal(annual.granularity, "year"); assert.equal(annual.timeline.length, 7); assert.equal(annual.timeline[6].income, 1800);
});

test("quick periods, all-time and custom ranges have stable local calendar boundaries", () => {
  const today = new Date("2026-10-16T12:00:00");
  assert.equal(getReportRange("day", "", "", transactions, today).start, "2026-10-16");
  assert.equal(getReportRange("week", "", "", transactions, today).start, "2026-10-12");
  assert.equal(getReportRange("month", "", "", transactions, today).start, "2026-10-01");
  assert.equal(getReportRange("year", "", "", transactions, today).start, "2026-01-01");
  const all = getReportRange("all", "", "", transactions, today);
  assert.equal(all.start, "2026-10-09"); assert.equal(all.end, "2026-10-20");
  const empty = getReportRange("all", "", "", [], today);
  assert.equal(empty.start, "2026-10-16"); assert.equal(empty.end, "2026-10-16");
});

test("incomplete, impossible or reversed custom ranges yield a recoverable validation error", () => {
  for (const [start, end] of [["", "2026-10-16"], ["2026-02-30", "2026-10-16"], ["2026-10-17", "2026-10-16"]]) {
    const result = getReportRange("custom", start, end, transactions);
    assert.ok(result.error); assert.deepEqual(buildStoreReports(stores, categories, transactions, result), []);
  }
  assert.equal(validReportDate("2026-02-30"), false); assert.equal(validReportDate("2024-02-29"), true);
});

test("orphaned, invalid and duplicate records do not inflate the report", () => {
  const records = [transactions[0], transactions[0], transaction("orphan", "deleted-store", "income", 1000, "missing"), transaction("bad-date", "a", "income", 50, "a-income", "2026-02-30"), transaction("nan", "a", "income", NaN, "a-income"), transaction("negative", "a", "income", -50, "a-income")];
  const result = report(stores, records)[0];
  assert.equal(result.income, 100); assert.equal(result.count, 1);
});

test("decimal money remains precise and selecting zero-record stores produces finite zero totals", () => {
  const group = report([stores[0]], [transaction("x", "a", "income", 0.1, "a-income"), transaction("y", "a", "income", 0.2, "a-income"), transaction("z", "a", "expense", 0.1, "a-ads")])[0];
  assert.equal(group.income, 0.3); assert.equal(group.expense, 0.1); assert.equal(group.profit, 0.2);
  const empty = report([stores[4]])[0];
  assert.equal(empty.income, 0); assert.equal(empty.profit, 0); assert.equal(empty.byStore[0].count, 0);
});

test("folder breakdown compares folder totals while keeping each currency separate", () => {
  const groups = buildStoreReports(stores, categories, transactions, range, "all", folders);
  const azn = groups.find((item) => item.currency === "AZN");
  const first = azn.byFolder.find((item) => item.id === "f1"); const second = azn.byFolder.find((item) => item.id === "f2");
  assert.equal(first.label, "Birinci"); assert.equal(first.storeCount, 2); assert.equal(first.income, 150); assert.equal(first.expense, 110); assert.equal(first.profit, 40);
  assert.equal(second.storeCount, 1); assert.equal(second.profit, 65);
  for (const group of groups) for (const key of ["income", "expense", "profit", "count"]) assert.equal(group.byFolder.reduce((sum, point) => sum + point[key], 0), group[key]);
  const usd = groups.find((item) => item.currency === "USD");
  assert.equal(usd.byFolder[0].label, "Klasörsüz mağazalar"); assert.equal(usd.byFolder[0].profit, 160);
  assert.equal(groups.find((item) => item.currency === "EUR").byFolder[0].label, "Klasörsüz mağazalar");
});

test("folder comparison follows selected stores and category filters", () => {
  const selected = stores.filter((item) => item.id !== "a");
  const group = buildStoreReports(selected, categories, transactions, range, JSON.stringify(["expense", "reklam"]), folders)[0];
  assert.equal(group.byFolder.find((item) => item.id === "f1").expense, 80);
  assert.equal(group.byFolder.find((item) => item.id === "f1").storeCount, 1);
  assert.equal(group.byFolder.find((item) => item.id === "f2").count, 0);
  assert.equal(group.profit, -80);
});


const order = (id, storeId = "a", status = "active", createdAt = "2026-10-10T12:00:00") => ({ id, storeId, status, createdAt, updatedAt: "2026-10-25T12:00:00", amount: 0, items: [{ productId: "bag", quantity: 2 }, { productId: "wallet", quantity: 3 }] });
const orders = [order("one"), order("two", "b", "completed"), order("three", "d"), order("four", "c", "cancelled"), order("five", "a", "active", "2026-10-11T12:00:00")];

test("sales count incoming orders without revenue and each bundle counts as one sale", () => {
  const result = buildSalesReport(stores, folders, orders, range);
  assert.equal(result.total, 4); assert.equal(result.activeDays, 2);
  assert.deepEqual(result.timeline.map((point) => point.sales), [3, 1]);
  assert.equal(result.byStore.find((point) => point.id === "a").sales, 2);
  for (const points of [result.timeline, result.byStore, result.byFolder]) assert.equal(points.reduce((sum, point) => sum + point.sales, 0), result.total);
});

test("sales status filters exclude cancellations by default and support all individual statuses", () => {
  for (const [status, expected] of [["valid", 4], ["all", 5], ["active", 3], ["completed", 1], ["cancelled", 1]]) {
    assert.equal(buildSalesReport(stores, folders, orders, range, status).total, expected);
  }
  assert.equal(matchesSalesStatus(order("unknown", "a", "unknown"), "all"), false);
});

test("sales scopes combine currencies and respect folder, paused-store and individual store selections", () => {
  const folder = scopedReportStores(stores, folders, "folder:f1", "all");
  assert.equal(buildSalesReport(folder, folders, orders, range).total, 3);
  assert.equal(buildSalesReport(scopedReportStores(stores, folders, "all", "paused"), folders, orders, range).total, 1);
  const all = buildSalesReport(stores, folders, orders, range);
  assert.equal(all.total, 4); assert.equal(all.storeCount, 5);
  assert.equal(all.byFolder.find((point) => point.id === "").sales, 1);
  assert.equal(all.byFolder.find((point) => point.id === "").storeCount, 2);
  assert.equal(buildSalesReport([stores[3]], folders, orders, range).total, 1);
  assert.equal(buildSalesReport([], folders, orders, range).total, 0);
});

test("sales dates use creation day in local time rather than completion or modification time", () => {
  const date = new Date("2026-10-10T23:30:00-10:00");
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  assert.equal(orderCreatedDate({ createdAt: "2026-10-10T23:30:00-10:00" }), local);
  assert.equal(orderCreatedDate({ createdAt: "2026-10-10" }), "2026-10-10");
  for (const createdAt of [undefined, "", "bad", "2026-02-30T10:00:00Z", "2026-10-10garbage"]) assert.equal(orderCreatedDate({ createdAt }), null);
  const result = buildSalesReport(stores, folders, [order("delivered", "a", "completed", "2026-10-10T12:00:00")], range);
  assert.equal(result.timeline[0].sales, 1); assert.equal(result.timeline[1].sales, 0);
});

test("sales date bounds include both endpoints, zero-fill empty days and reject invalid or duplicate orders", () => {
  const records = [orders[0], orders[0], order("first", "a", "active", "2026-10-09"), order("last", "a", "active", "2026-10-12"), order("before", "a", "active", "2026-10-08"), order("after", "a", "active", "2026-10-13"), order("orphan", "missing"), order("invalid", "a", "active", "invalid"), order("unknown", "a", "unknown")];
  const result = buildSalesReport(stores, folders, records, { start: "2026-10-09", end: "2026-10-12", error: null });
  assert.equal(result.total, 3); assert.deepEqual(result.timeline.map((point) => point.sales), [1, 1, 0, 1]);
  for (const invalidRange of [{ start: "2026-10-12", end: "2026-10-09", error: null }, { ...range, error: "invalid" }]) {
    const empty = buildSalesReport(stores, folders, records, invalidRange);
    assert.equal(empty.total, 0); assert.deepEqual(empty.timeline, []);
  }
});

test("sales stay daily for a full year and long-range buckets reconcile with total orders", () => {
  const year = buildSalesReport(stores, folders, orders, { start: "2026-01-01", end: "2026-12-31", error: null });
  assert.equal(year.granularity, "day"); assert.equal(year.timeline.length, 365);
  const monthly = buildSalesReport(stores, folders, orders, { start: "2025-01-01", end: "2026-12-31", error: null });
  assert.equal(monthly.granularity, "month"); assert.equal(monthly.timeline.length, 24);
  const annual = buildSalesReport(stores, folders, orders, { start: "2020-01-01", end: "2026-12-31", error: null });
  assert.equal(annual.granularity, "year"); assert.equal(annual.timeline.length, 7);
  for (const result of [year, monthly, annual]) assert.equal(result.timeline.reduce((sum, point) => sum + point.sales, 0), 4);
});

test("all-time sales range can be derived solely from orders when financial records are empty", () => {
  const dates = orders.map((item) => ({ date: orderCreatedDate(item) ?? "" }));
  const result = getReportRange("all", "", "", dates, new Date("2026-10-16T12:00:00"));
  assert.equal(result.start, "2026-10-10"); assert.equal(result.end, "2026-10-16");
  assert.equal(buildSalesReport(stores, folders, orders, result).total, 4);
});
