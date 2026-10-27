import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const loaded = { exports: {} };
const source = ts.transpileModule(readFileSync(resolve("src/lib/expense-breakdown.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function("module", "exports", source)(loaded, loaded.exports);
const { buildExpenseBreakdown } = loaded.exports;
const categories = [
  { id: "ads", storeId: "s1", name: "Reklam", type: "expense", color: "#ff0000" },
  { id: "stock", storeId: "s1", name: "Ürün", type: "expense", color: "#00ff00" },
  { id: "foreign", storeId: "s2", name: "Other store", type: "expense" },
];
const record = (id, categoryId, amount, extra = {}) => ({ id, categoryId, amount, storeId: "s1", type: "expense", date: "2026-10-27", ...extra });

test("all expense categories reconcile with the chart total, including orphaned categories", () => {
  const result = buildExpenseBreakdown("s1", categories, [record("a", "ads", 100), record("b", "stock", 50), record("c", "deleted", 20), record("d", "foreign", 30)]);
  assert.equal(result.total, 200); assert.equal(result.count, 4);
  assert.deepEqual(result.items.map(x => [x.name, x.value, x.count, x.share]), [["Reklam", 100, 1, 50], ["Kategorisiz", 50, 2, 25], ["Ürün", 50, 1, 25]]);
  assert.equal(result.items[0].color, "#ff0000");
  assert.equal(result.items.reduce((sum, x) => sum + x.value, 0), result.total);
});
test("duplicate snapshots do not double expenses and other stores or income are excluded", () => {
  const item = record("a", "ads", 100);
  const result = buildExpenseBreakdown("s1", categories, [item, item, record("income", "ads", 999, { type: "income" }), record("s2", "foreign", 1000, { storeId: "s2" })]);
  assert.equal(result.total, 100); assert.equal(result.count, 1); assert.equal(result.items.length, 1);
});
test("decimal category amounts stay exact and shares cover the whole distribution", () => {
  const result = buildExpenseBreakdown("s1", categories, [record("a", "ads", 0.1), record("b", "ads", 0.2), record("c", "stock", 0.7)]);
  assert.equal(result.total, 1); assert.equal(result.items.find(x => x.id === "ads").value, 0.3);
  assert.equal(result.items.reduce((sum, x) => sum + x.share, 0), 100);
});
test("empty or invalid expense inputs have a finite empty distribution", () => {
  const result = buildExpenseBreakdown("s1", categories, [record("a", "ads", NaN), record("b", "ads", -5), record("c", "stock", 0), record("d", "ads", Infinity)]);
  assert.deepEqual(result, { total: 0, count: 0, items: [] });
});
