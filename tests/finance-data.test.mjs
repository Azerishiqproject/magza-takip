import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const baseOrder = { id: "o1", storeId: "s1", customerName: "Aylin", product: "Çanta", amount: 100, shippingCost: 10, stage: "delivered", status: "completed", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", completedAt: "2026-10-02T10:00:00Z" };
const baseProduct = { id: "p1", storeId: "s1", name: "Çanta", sku: "CANTA", price: 50, stock: 10, active: true, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z" };
const baseStore = { id: "s1", name: "Mağaza", domain: "example.com", currency: "AZN", color: "#2dd4bf", status: "active" };

function harness() {
  const state = [];
  const listeners = new Map();
  const cloud = new Map();
  const commits = [];
  const cache = new Map();
  let index = 0;
  let mounted = false;
  let fail = false;
  const ref = (name, id) => ({ path: `${name}/${id}` });
  const firestore = {
    collection: (_, name) => ({ name }),
    doc: (_, name, id) => ref(name, id),
    onSnapshot: (collection, options, callback) => { listeners.set(collection.name, callback); return () => {}; },
    where: (field, op, value) => ({ field, op, value }),
    query: (collection, condition) => ({ ...collection, condition }),
    getDocs: async ({ name, condition }) => ({ docs: [...cloud].filter(([path, data]) => path.startsWith(`${name}/`) && data[condition.field] === condition.value).map(([path, data]) => ({ id: path.split("/")[1], ref: { path }, data: () => data })) }),
    setDoc: async (reference, data) => { if (fail) throw new Error("write failed"); cloud.set(reference.path, data); },
    runTransaction: async (_, callback) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const reads = new Map(); const operations = []; let writing = false;
        const transaction = {
          get: async (reference) => {
            assert.equal(writing, false, "Firestore transactions must read before writing");
            const fields = cloud.get(reference.path);
            reads.set(reference.path, JSON.stringify(fields));
            return { id: reference.path.split("/")[1], ref: reference, exists: () => fields !== undefined, data: () => fields === undefined ? undefined : JSON.parse(JSON.stringify(fields)) };
          },
          set: (reference, data) => { writing = true; operations.push({ kind: "set", reference, data }); },
          update: (reference, data) => { writing = true; operations.push({ kind: "update", reference, data }); },
          delete: (reference) => { writing = true; operations.push({ kind: "delete", reference }); },
        };
        const result = await callback(transaction);
        if (fail) throw new Error("write failed");
        if ([...reads].some(([path, value]) => JSON.stringify(cloud.get(path)) !== value)) continue;
        for (const operation of operations) if (operation.kind === "update" && !cloud.has(operation.reference.path)) throw new Error("document missing");
        commits.push(operations);
        for (const operation of operations) {
          if (operation.kind === "delete") cloud.delete(operation.reference.path);
          else cloud.set(operation.reference.path, { ...(operation.kind === "update" ? cloud.get(operation.reference.path) : {}), ...operation.data });
        }
        return result;
      }
      throw new Error("conflicting transaction");
    },
    writeBatch: () => {
      const operations = [];
      return {
        set: (reference, data) => operations.push({ kind: "set", reference, data }),
        update: (reference, data) => operations.push({ kind: "update", reference, data }),
        delete: (reference) => operations.push({ kind: "delete", reference }),
        commit: async () => {
          if (fail) throw new Error("write failed");
          commits.push(operations);
          for (const operation of operations) {
            if (operation.kind === "delete") cloud.delete(operation.reference.path);
            else cloud.set(operation.reference.path, { ...(operation.kind === "update" ? cloud.get(operation.reference.path) : {}), ...operation.data });
          }
        },
      };
    },
  };
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const localRequire = (id) => {
      if (id === "react") return { useRef: (initial) => { const slot = index++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; }, useState: (initial) => { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }]; }, useEffect: (callback) => { if (!mounted) callback(); } };
      if (id === "firebase/firestore") return firestore;
      if (id === "@/lib/firebase") return { db: {} };
      if (id.startsWith("@/")) return load(resolve("src", `${id.slice(2)}.ts`));
      if (id.startsWith("./")) return load(resolve(filename, "..", `${id}.ts`));
      return require(id);
    };
    vm.runInThisContext(`(function(require, module, exports) { ${source}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  const hookUnderTest = load(resolve("src/hooks/use-finance-data.ts")).useFinanceData;
  const render = () => { index = 0; const result = hookUnderTest(); mounted = true; return result; };
  render();
  const emit = (name, documents, fromCache = false) => {
    for (const data of documents) { const { id, ...fields } = data; cloud.set(`${name}/${id}`, fields); }
    listeners.get(name)({ metadata: { fromCache }, empty: !documents.length, docs: documents.map(({ id, ...data }) => ({ id, data: () => data })) });
  };
  const online = ({ stores = [baseStore], orders = [baseOrder], transactions = [], categories = [], storeFolders = [], products = [] } = {}) => {
    for (const [name, documents] of Object.entries({ stores, orders, transactions, categories, storeFolders, products })) emit(name, documents);
    return render();
  };
  return { render, online, emit, cloud, commits, fail: () => { fail = true; }, reconcile: load(resolve("src/lib/order-transactions.ts")).reconcileOrderTransactions };
}

test("completed order edits synchronize amounts and preserve financial dates/categories", async () => {
  const app = harness();
  const income = { id: "order-income-o1", storeId: "s1", orderId: "o1", categoryId: "custom-sales", date: "2026-10-04", type: "income", title: "Özel açıklama", amount: 100, note: "Özel not" };
  const data = app.online({ transactions: [income] });
  await data.updateOrder("o1", { amount: 250, shippingCost: 15, customerName: "Leyla", product: "Ayakkabı" });
  const result = app.render();
  assert.equal(result.orders[0].amount, 250);
  assert.equal(result.orders[0].status, "completed");
  assert.equal(result.orders[0].stage, "delivered");
  const updatedIncome = result.transactions.find((item) => item.type === "income");
  assert.equal(updatedIncome.amount, 250);
  assert.equal(updatedIncome.categoryId, "custom-sales");
  assert.equal(updatedIncome.date, "2026-10-04");
  assert.equal(updatedIncome.note, "Özel not");
  assert.equal(updatedIncome.title, "Leyla — Ayakkabı");
  assert.equal(result.transactions.find((item) => item.type === "expense").amount, 15);
  assert.equal(app.commits.length, 1);
});

test("shipping zero removes the financial expense and adding it back recreates it", async () => {
  const app = harness();
  await app.online().updateOrder("o1", { shippingCost: 0 });
  assert.equal(app.render().transactions.length, 1);
  assert.equal(app.cloud.has("transactions/order-shipping-o1"), false);
  await app.render().updateOrder("o1", { shippingCost: 20 });
  assert.equal(app.render().transactions.find((item) => item.type === "expense").amount, 20);
});

test("active and cancelled orders never generate income; cancelled shipping follows the checkbox", async () => {
  const app = harness();
  await app.online({ orders: [{ ...baseOrder, stage: "new", status: "active" }] }).updateOrder("o1", { amount: 200 });
  assert.equal(app.render().transactions.length, 0);
  app.emit("orders", [{ ...baseOrder, status: "cancelled", cancelledShippingCharged: true }]);
  await app.render().updateOrder("o1", { shippingCost: 30 });
  assert.equal(app.render().transactions.length, 1);
  assert.equal(app.render().transactions[0].type, "expense");
  await app.render().updateOrder("o1", { cancelledShippingCharged: false });
  assert.equal(app.render().transactions.length, 0);
});

test("failed order writes and invalid amounts leave local state unchanged", async () => {
  const app = harness(); const data = app.online();
  await assert.rejects(data.updateOrder("o1", { amount: -1 }), /kontrol edin/);
  await assert.rejects(data.updateOrder("o1", { customerName: "  " }), /kontrol edin/);
  app.fail();
  await assert.rejects(data.updateOrder("o1", { amount: 200 }), /write failed/);
  assert.equal(app.render().orders[0].amount, 100);
  assert.equal(app.render().transactions.length, 0);
});

test("order deletion removes all linked server records while keeping unrelated transactions", async () => {
  const app = harness(); const unrelated = { id: "manual", storeId: "s1", title: "Manuel gelir", type: "income", categoryId: "sales", date: "2026-10-01", amount: 50 };
  const data = app.online({ transactions: [unrelated] });
  app.cloud.set("transactions/extra-order-record", { orderId: "o1", storeId: "s1", amount: 10 });
  await data.deleteOrder("o1");
  assert.equal(app.render().orders.length, 0);
  assert.equal(app.cloud.has("transactions/extra-order-record"), false);
  assert.equal(app.render().transactions.length, 1);
  assert.equal(app.cloud.has("transactions/manual"), true);
});

test("folders remain optional, can be renamed, and deletion ungroups stores", async () => {
  const app = harness(); await app.online({ orders: [] }).saveFolder("Türkiye", "f1");
  await app.render().saveFolder("Azerbaycan", "f2");
  await app.render().updateStore("s1", { folderId: "f1" });
  await app.render().saveFolder("Türkiye mağazaları", "f1");
  assert.equal(app.render().folders.find((item) => item.id === "f1").name, "Türkiye mağazaları");
  await assert.rejects(app.render().saveFolder("Azerbaycan", "f3"), /zaten var/);
  await assert.rejects(app.render().updateStore("s1", { folderId: "missing" }), /bulunamadı/);
  await app.render().deleteFolder("f1");
  assert.equal(app.render().stores[0].folderId, null);
  assert.equal(app.cloud.get("stores/s1").folderId, null);
  assert.equal(app.render().folders.length, 1);
  assert.equal(app.render().stores.length, 1);
});

test("store deletion handles more than a batch of records and preserves other stores", async () => {
  const app = harness(); const second = { ...baseStore, id: "s2", name: "İkinci" };
  const data = app.online({ stores: [baseStore, second] });
  for (let i = 0; i < 920; i++) app.cloud.set(`transactions/t${i}`, { storeId: "s1" });
  app.cloud.set("transactions/keep", { storeId: "s2" });
  await data.deleteStore("s1");
  assert.equal(app.render().stores.length, 1);
  assert.equal(app.render().stores[0].id, "s2");
  assert.equal(app.cloud.has("transactions/keep"), true);
  assert.equal([...app.cloud.values()].some((item) => item.storeId === "s1"), false);
  assert.ok(app.commits.every((batch) => batch.length <= 450));
  assert.equal(app.commits.at(-1).at(-1).reference.path, "stores/s1");
});

test("empty snapshots clear the last deleted records and last store can be recreated", async () => {
  const app = harness(); app.online();
  for (const name of ["stores", "categories", "transactions", "orders"]) app.emit(name, []);
  const data = app.render();
  assert.equal(data.stores.length, 0); assert.equal(data.transactions.length, 0); assert.equal(data.categories.length, 0); assert.equal(data.orders.length, 0);
  await data.addStore(baseStore);
  assert.equal(app.render().stores.length, 1);
});

test("demo edits and deletion work locally without sending database writes", async () => {
  const app = harness(); await app.render().saveFolder("Demo", "demo-folder");
  const id = app.render().stores[0].id;
  await app.render().updateStore(id, { folderId: "demo-folder", status: "paused" });
  assert.equal(app.render().stores[0].status, "paused");
  const order = await app.render().addOrder({ storeId: id, customerName: "Müşteri", productId: "demo-bag", quantity: 1, amount: 30 });
  await app.render().updateOrder(order.id, { amount: 40 });
  await app.render().deleteOrder(order.id);
  await app.render().deleteStore(id);
  assert.equal(app.render().orders.length, 0);
  assert.equal(app.render().transactions.some((item) => item.storeId === id), false);
  assert.equal(app.cloud.size, 0);
});


test("initial cached empty snapshots do not erase demo data before the server responds", () => {
  const app = harness();
  app.emit("stores", [], true); app.emit("transactions", [], true); app.emit("categories", [], true);
  assert.equal(app.render().stores.length, 3);
  assert.equal(app.render().transactions.length, 64);
  assert.equal(app.render().isDemo, true);
  app.emit("stores", []);
  assert.equal(app.render().stores.length, 0);
  assert.equal(app.render().isDemo, false);
});

test("failed deletions preserve the order, store and linked local records", async () => {
  const app = harness(); const data = app.online(); app.fail();
  await assert.rejects(data.deleteOrder("o1"), /write failed/);
  await assert.rejects(data.deleteStore("s1"), /write failed/);
  assert.equal(app.render().orders.length, 1); assert.equal(app.render().stores.length, 1);
});

test("deleting a large folder ungroups all server stores within batch limits", async () => {
  const app = harness(); const data = app.online({ stores: [{ ...baseStore, folderId: "f1" }], storeFolders: [{ id: "f1", name: "Klasör" }] });
  for (let i = 0; i < 700; i++) app.cloud.set(`stores/extra${i}`, { ...baseStore, folderId: "f1" });
  await data.deleteFolder("f1");
  assert.ok([...app.cloud.values()].every((item) => item.folderId !== "f1"));
  assert.ok(app.commits.every((batch) => batch.length <= 500));
  assert.equal(app.cloud.has("storeFolders/f1"), false);
  assert.equal(app.render().stores[0].folderId, null);
});


test("product creation and stock adjustments stay within one store and reject invalid quantities", async () => {
  const app = harness(); await app.online({ orders: [], products: [] }).addProduct({ storeId: "s1", name: "Yeni ürün", sku: "YENI", price: 15, stock: 4 });
  const product = app.render().products[0];
  await app.render().adjustStock(product.id, 6);
  assert.equal(app.render().products[0].stock, 10);
  await app.render().adjustStock(product.id, -3);
  assert.equal(app.render().products[0].stock, 7);
  await assert.rejects(app.render().adjustStock(product.id, -8), /sıfırın altına/);
  await assert.rejects(app.render().adjustStock(product.id, 1.5), /tam sayı/);
  await assert.rejects(app.render().addProduct({ ...baseProduct, storeId: "missing" }), /Mağaza bulunamadı/);
});

test("creating an order deducts its quantity atomically; insufficient, fractional, inactive and foreign products fail", async () => {
  const app = harness(); const data = app.online({ stores: [baseStore, { ...baseStore, id: "s2", name: "İkinci" }], products: [baseProduct], orders: [] });
  const order = await data.addOrder({ storeId: "s1", customerName: "Aylin", productId: "p1", quantity: 3, amount: 150 });
  assert.equal(order.product, "Çanta"); assert.equal(order.stockDeducted, true); assert.equal(order.quantity, 3);
  assert.equal(app.cloud.get("products/p1").stock, 7); assert.equal(app.render().products[0].stock, 7);
  assert.equal(app.commits.length, 1); assert.ok(app.commits[0].some((item) => item.reference.path.startsWith("orders/")));
  await assert.rejects(data.addOrder({ storeId: "s1", customerName: "Aylin", productId: "p1", quantity: 8, amount: 150 }), /yeterli stok/);
  await assert.rejects(data.addOrder({ storeId: "s1", customerName: "Aylin", productId: "p1", quantity: 1.5, amount: 150 }), /tam sayı/);
  await assert.rejects(data.addOrder({ storeId: "s2", customerName: "Aylin", productId: "p1", quantity: 1, amount: 150 }), /bu mağazaya/);
  app.cloud.set("products/p1", { ...app.cloud.get("products/p1"), active: false });
  await assert.rejects(data.addOrder({ storeId: "s1", customerName: "Aylin", productId: "p1", quantity: 1, amount: 150 }), /satışa kapalı/);
  assert.equal(app.cloud.get("products/p1").stock, 7);
});

test("order quantity edits and product swaps apply only the stock difference", async () => {
  const app = harness(); const second = { ...baseProduct, id: "p2", name: "Cüzdan", stock: 5 };
  const order = await app.online({ products: [baseProduct, second], orders: [] }).addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 3, amount: 150 });
  await app.render().updateOrder(order.id, { quantity: 5 });
  assert.equal(app.cloud.get("products/p1").stock, 5);
  await app.render().updateOrder(order.id, { quantity: 2 });
  assert.equal(app.cloud.get("products/p1").stock, 8);
  await app.render().updateOrder(order.id, { productId: "p2", quantity: 4 });
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 1);
  assert.equal(app.render().orders[0].product, "Cüzdan");
  await assert.rejects(app.render().updateOrder(order.id, { quantity: 6 }), /yeterli stok/);
  assert.equal(app.cloud.get("products/p2").stock, 1); assert.equal(app.render().orders[0].quantity, 4);
});

test("cancelling restores stock once and deleting the cancelled order does not restore it again", async () => {
  const app = harness(); const order = await app.online({ products: [baseProduct], orders: [] }).addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 3, amount: 150 });
  await app.render().cancelOrder(order.id, false);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.render().orders[0].stockDeducted, false);
  await assert.rejects(app.render().cancelOrder(order.id, false), /Devam eden/);
  await app.render().updateOrder(order.id, { quantity: 8 });
  assert.equal(app.cloud.get("products/p1").stock, 10);
  await app.render().deleteOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 10);
});

test("delivery does not deduct stock again; completed order edits and deletion update stock and finances", async () => {
  const app = harness(); const order = await app.online({ products: [baseProduct], orders: [] }).addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 2, amount: 100 });
  await app.render().updateOrderStage(order.id, "contacted");
  await app.render().updateOrderStage(order.id, "responded");
  await app.render().updateOrderStage(order.id, "addressed", { shippingCost: 10 });
  await app.render().completeOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 8);
  await app.render().updateOrder(order.id, { quantity: 4, amount: 200 });
  assert.equal(app.cloud.get("products/p1").stock, 6);
  assert.equal(app.cloud.get(`transactions/order-income-${order.id}`).amount, 200);
  await app.render().deleteOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 10);
  assert.equal(app.cloud.has(`transactions/order-income-${order.id}`), false);
  assert.equal(app.cloud.has(`transactions/order-shipping-${order.id}`), false);
});

test("failed order creation never changes stock", async () => {
  const app = harness(); const data = app.online({ products: [baseProduct], orders: [] }); app.fail();
  await assert.rejects(data.addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 2, amount: 100 }), /write failed/);
  assert.equal(app.render().orders.length, 0); assert.equal(app.render().products[0].stock, 10);
  assert.equal(app.cloud.get("products/p1").stock, 10);
});

test("concurrent orders cannot oversell the same product", async () => {
  const app = harness(); const data = app.online({ products: [{ ...baseProduct, stock: 3 }], orders: [] });
  const results = await Promise.allSettled([data.addOrder({ storeId: "s1", customerName: "Bir", productId: "p1", quantity: 2, amount: 100 }), data.addOrder({ storeId: "s1", customerName: "İki", productId: "p1", quantity: 2, amount: 100 })]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(app.cloud.get("products/p1").stock, 1);
  assert.equal([...app.cloud.keys()].filter((path) => path.startsWith("orders/")).length, 1);
});

test("legacy orders do not return stock they never deducted; store deletion removes its products", async () => {
  const app = harness(); await app.online({ products: [baseProduct], orders: [baseOrder] }).deleteOrder("o1");
  assert.equal(app.cloud.get("products/p1").stock, 10);
  await app.render().deleteStore("s1");
  assert.equal(app.cloud.has("products/p1"), false); assert.equal(app.render().products.length, 0);
});


test("failed stock order edits and cancellation leave both order and product unchanged", async () => {
  const app = harness(); const order = await app.online({ products: [baseProduct], orders: [] }).addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 2, amount: 100 });
  app.fail();
  await assert.rejects(app.render().updateOrder(order.id, { quantity: 4 }), /write failed/);
  await assert.rejects(app.render().cancelOrder(order.id, false), /write failed/);
  await assert.rejects(app.render().deleteOrder(order.id), /write failed/);
  assert.equal(app.cloud.get("products/p1").stock, 8); assert.equal(app.render().products[0].stock, 8);
  assert.equal(app.render().orders[0].quantity, 2); assert.equal(app.render().orders[0].status, "active");
});

test("active order deletion restores stock once and tracked orders cannot detach their product", async () => {
  const app = harness(); const order = await app.online({ products: [baseProduct], orders: [] }).addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 2, amount: 100 });
  await assert.rejects(app.render().updateOrder(order.id, { productId: null }), /ürün kaldırılamaz/);
  await assert.rejects(app.render().updateOrder(order.id, { productId: "" }), /ürün kaldırılamaz/);
  await app.render().deleteOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 10);
  await assert.rejects(app.render().deleteOrder(order.id), /Sipariş bulunamadı/);
  assert.equal(app.cloud.get("products/p1").stock, 10);
});

test("rapid demo orders also use the latest stock rather than a stale render", async () => {
  const app = harness(); const data = app.render();
  const results = await Promise.allSettled([data.addOrder({ storeId: "north-atelier", customerName: "Bir", productId: "demo-bag", quantity: 15, amount: 100 }), data.addOrder({ storeId: "north-atelier", customerName: "İki", productId: "demo-bag", quantity: 15, amount: 100 })]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(app.render().products.find((item) => item.id === "demo-bag").stock, 5);
  assert.equal(app.cloud.size, 0);
});


test("sold-out or inactive products still allow existing orders to keep or reduce their quantity", async () => {
  const app = harness(); const order = await app.online({ products: [{ ...baseProduct, stock: 2 }], orders: [] }).addOrder({ storeId: "s1", customerName: "Müşteri", productId: "p1", quantity: 2, amount: 100 });
  await app.render().updateOrder(order.id, { amount: 90 });
  assert.equal(app.cloud.get("products/p1").stock, 0);
  await app.render().updateProduct("p1", { name: "Yeni ürün adı", sku: "YENI", price: 60, active: false });
  await app.render().updateOrder(order.id, { quantity: 1 });
  assert.equal(app.cloud.get("products/p1").stock, 1);
  assert.equal(app.render().orders[0].product, "Çanta");
  await assert.rejects(app.render().updateOrder(order.id, { quantity: 2 }), /satışa kapalı/);
  await app.render().cancelOrder(order.id, false);
  assert.equal(app.cloud.get("products/p1").stock, 2);
});


test("quantity edits preserve manually edited shipping descriptions, notes, dates and categories", async () => {
  const app = harness(); const order = { ...baseOrder, productId: "p1", quantity: 2, stockDeducted: true };
  const shipping = { id: "order-shipping-o1", storeId: "s1", orderId: "o1", categoryId: "custom-shipping", date: "2026-10-04", type: "expense", title: "Özel kargo açıklaması", amount: 10, note: "Özel kargo notu" };
  await app.online({ orders: [order], products: [{ ...baseProduct, stock: 8 }], transactions: [shipping] }).updateOrder("o1", { quantity: 3, amount: 150 });
  const updated = app.render().transactions.find((item) => item.id === "order-shipping-o1");
  assert.equal(updated.title, shipping.title); assert.equal(updated.note, shipping.note); assert.equal(updated.date, shipping.date); assert.equal(updated.categoryId, shipping.categoryId);
  assert.equal(app.render().transactions.find((item) => item.type === "income").title, "Aylin — Çanta × 3");
  assert.equal(app.cloud.get("products/p1").stock, 7);
});

const bundleProducts = [baseProduct, { ...baseProduct, id: "p2", name: "Cüzdan", price: 25, stock: 8 }, { ...baseProduct, id: "p3", name: "Kemer", price: 30, stock: 6 }];
const bundleInput = { storeId: "s1", customerName: "Paket müşterisi", amount: 175, items: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 3 }] };

test("bundle creation deducts each product and stores names and unit prices in one transaction", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder(bundleInput);
  assert.equal(app.cloud.get("products/p1").stock, 8);
  assert.equal(app.cloud.get("products/p2").stock, 5);
  assert.equal(app.cloud.get("products/p3").stock, 6);
  assert.deepEqual(order.items.map((item) => [item.product, item.quantity, item.unitPrice]), [["Çanta", 2, 50], ["Cüzdan", 3, 25]]);
  assert.equal(order.productId, null); assert.equal(order.stockDeducted, true);
  assert.equal(order.amount, 175); assert.equal(app.commits.length, 1);
});

test("one insufficient product rejects the entire bundle without deducting the other products", async () => {
  const app = harness(); const data = app.online({ products: bundleProducts, orders: [] });
  await assert.rejects(data.addOrder({ ...bundleInput, items: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 9 }] }), /yeterli stok/);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 8);
  assert.equal(app.render().orders.length, 0); assert.equal(app.commits.length, 0);
});

test("duplicate product lines are counted together for stock and cannot bypass the stock limit", async () => {
  const app = harness(); const data = app.online({ products: bundleProducts, orders: [] });
  await assert.rejects(data.addOrder({ ...bundleInput, items: [{ productId: "p1", quantity: 6 }, { productId: "p1", quantity: 5 }] }), /yeterli stok/);
  const order = await data.addOrder({ ...bundleInput, items: [{ productId: "p1", quantity: 2 }, { productId: "p1", quantity: 3 }] });
  assert.equal(app.cloud.get("products/p1").stock, 5);
  await app.render().cancelOrder(order.id, false);
  assert.equal(app.cloud.get("products/p1").stock, 10);
});

test("bundle editing restores removed products, adjusts quantities and deducts newly added products", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder(bundleInput);
  await app.render().updateOrder(order.id, { items: [{ productId: "p2", quantity: 4 }, { productId: "p3", quantity: 2 }], amount: 160 });
  assert.equal(app.cloud.get("products/p1").stock, 10);
  assert.equal(app.cloud.get("products/p2").stock, 4);
  assert.equal(app.cloud.get("products/p3").stock, 4);
  assert.deepEqual(app.render().orders[0].items.map((item) => item.product), ["Cüzdan", "Kemer"]);
  await app.render().updateOrder(order.id, { items: [{ productId: "p3", quantity: 1 }], amount: 30 });
  assert.equal(app.cloud.get("products/p2").stock, 8); assert.equal(app.cloud.get("products/p3").stock, 5);
  assert.equal(app.render().orders[0].productId, "p3");
});

test("failed bundle edits roll back all stock differences and leave the order unchanged", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder(bundleInput);
  await assert.rejects(app.render().updateOrder(order.id, { items: [{ productId: "p1", quantity: 1 }, { productId: "p3", quantity: 7 }] }), /yeterli stok/);
  assert.equal(app.cloud.get("products/p1").stock, 8); assert.equal(app.cloud.get("products/p2").stock, 5); assert.equal(app.cloud.get("products/p3").stock, 6);
  assert.equal(app.render().orders[0].items.length, 2);
  app.fail();
  await assert.rejects(app.render().updateOrder(order.id, { items: [{ productId: "p3", quantity: 2 }] }), /write failed/);
  assert.equal(app.cloud.get("products/p1").stock, 8); assert.equal(app.cloud.get("products/p3").stock, 6);
});

test("bundle cancellation restores all products once and later deletion does not refund again", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder(bundleInput);
  await app.render().cancelOrder(order.id, false);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 8);
  await app.render().updateOrder(order.id, { items: [{ productId: "p3", quantity: 3 }] });
  assert.equal(app.cloud.get("products/p3").stock, 6);
  await app.render().deleteOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 8); assert.equal(app.cloud.get("products/p3").stock, 6);
});

test("completed bundle has one total income and quantity edits keep finances and stock in sync", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder({ ...bundleInput, amount: 150 });
  await app.render().updateOrderStage(order.id, "contacted"); await app.render().updateOrderStage(order.id, "responded"); await app.render().updateOrderStage(order.id, "addressed", { shippingCost: 10 }); await app.render().completeOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 8); assert.equal(app.cloud.get("products/p2").stock, 5);
  assert.equal(app.render().transactions.filter((item) => item.type === "income").length, 1);
  assert.equal(app.cloud.get(`transactions/order-income-${order.id}`).amount, 150);
  assert.equal(app.cloud.get(`transactions/order-income-${order.id}`).title, "Paket müşterisi — Çanta × 2 + Cüzdan × 3");
  await app.render().updateOrder(order.id, { items: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 2 }], amount: 90 });
  assert.equal(app.cloud.get("products/p1").stock, 9); assert.equal(app.cloud.get("products/p2").stock, 6);
  assert.equal(app.cloud.get(`transactions/order-income-${order.id}`).amount, 90);
  assert.equal(app.cloud.get(`transactions/order-income-${order.id}`).title, "Paket müşterisi — Çanta × 1 + Cüzdan × 2");
  await app.render().deleteOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 8);
  assert.equal(app.cloud.has(`transactions/order-income-${order.id}`), false);
});

test("upgrading an older single-product order to a bundle does not deduct the original stock twice", async () => {
  const app = harness(); const oldOrder = { ...baseOrder, status: "active", stage: "new", productId: "p1", quantity: 2, stockDeducted: true };
  await app.online({ products: [{ ...baseProduct, stock: 8 }, bundleProducts[1]], orders: [oldOrder] }).updateOrder("o1", { items: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 3 }], amount: 175 });
  assert.equal(app.cloud.get("products/p1").stock, 8); assert.equal(app.cloud.get("products/p2").stock, 5);
  await app.render().cancelOrder("o1", false);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 8);
});

test("bundle lines preserve historical names and prices when products are edited or rows reordered", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder(bundleInput);
  await app.render().updateProduct("p1", { name: "Yeni çanta", sku: "YENI", price: 100, active: true });
  await app.render().updateOrder(order.id, { items: [{ productId: "p2", quantity: 2 }, { productId: "p1", quantity: 1 }] });
  const item = app.render().orders[0].items.find((entry) => entry.productId === "p1");
  assert.equal(item.product, "Çanta"); assert.equal(item.unitPrice, 50);
  assert.equal(app.cloud.get("products/p1").stock, 9);
});

test("empty bundles, invalid rows and products from another store are rejected atomically", async () => {
  const app = harness(); const data = app.online({ products: [...bundleProducts, { ...baseProduct, id: "foreign", storeId: "s2" }], orders: [] });
  for (const items of [[], [{ productId: "", quantity: 1 }], [{ productId: "p1", quantity: 0 }], [{ productId: "p1", quantity: 1.5 }], [{ productId: "p1", quantity: 1 }, { productId: "foreign", quantity: 1 }]]) await assert.rejects(data.addOrder({ ...bundleInput, items }));
  assert.equal(app.render().orders.length, 0); assert.equal(app.cloud.get("products/p1").stock, 10);
  const order = await data.addOrder(bundleInput);
  await assert.rejects(app.render().updateOrder(order.id, { items: [] }), /en az bir ürün/);
  assert.equal(app.render().orders[0].items.length, 2);
});

test("concurrent bundles cannot oversell a shared product or partially deduct their other products", async () => {
  const app = harness(); const data = app.online({ products: [{ ...baseProduct, stock: 3 }, bundleProducts[1], bundleProducts[2]], orders: [] });
  const results = await Promise.allSettled([data.addOrder({ ...bundleInput, items: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }] }), data.addOrder({ ...bundleInput, items: [{ productId: "p1", quantity: 2 }, { productId: "p3", quantity: 1 }] })]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(app.cloud.get("products/p1").stock, 1);
  assert.equal(app.cloud.get("products/p2").stock + app.cloud.get("products/p3").stock, 13);
  assert.equal(app.render().orders.length, 1);
});

test("three different products can be saved and deleted as one bundle", async () => {
  const app = harness(); const order = await app.online({ products: bundleProducts, orders: [] }).addOrder({ ...bundleInput, amount: 190, items: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 2 }, { productId: "p3", quantity: 3 }] });
  assert.equal(order.items.length, 3);
  assert.equal(app.cloud.get("products/p1").stock, 9); assert.equal(app.cloud.get("products/p2").stock, 6); assert.equal(app.cloud.get("products/p3").stock, 3);
  await app.render().deleteOrder(order.id);
  assert.equal(app.cloud.get("products/p1").stock, 10); assert.equal(app.cloud.get("products/p2").stock, 8); assert.equal(app.cloud.get("products/p3").stock, 6);
});

test("store profitability settings persist without changing finance records or other stores", async () => {
  const app = harness();
  const categories = [
    { id: "sales", storeId: "s1", type: "income", name: "Sipariş gelirleri" },
    { id: "ads", storeId: "s1", type: "expense", name: "Seçilen reklam kategorisi" },
  ];
  const data = app.online({ stores: [baseStore, { ...baseStore, id: "s2", name: "Başka mağaza", domain: "other.com" }], categories });
  const profitSettings = { averageSalePrice: 45, averageUnitCost: 12, advertisingCategoryIds: ["ads"], productPurchaseCategoryIds: [], salesCategoryIds: ["sales"] };
  const beforeOrders = JSON.stringify(app.render().orders);
  await data.updateStore("s1", { profitSettings });
  assert.deepEqual(app.cloud.get("stores/s1").profitSettings, profitSettings);
  assert.deepEqual(app.render().stores.find(s => s.id === "s1").profitSettings, profitSettings);
  assert.equal(app.render().stores.find(s => s.id === "s2").profitSettings, undefined);
  assert.equal(JSON.stringify(app.render().orders), beforeOrders);
  assert.equal(app.render().transactions.length, 0);
  app.emit("stores", [{ ...baseStore, ...app.cloud.get("stores/s1") }]);
  assert.deepEqual(app.render().stores[0].profitSettings, profitSettings);
});

test("failed profitability settings save does not update local state", async () => {
  const app = harness();
  const data = app.online({ categories: [{ id: "ads", storeId: "s1", type: "expense", name: "Reklam" }] });
  app.fail();
  await assert.rejects(data.updateStore("s1", { profitSettings: { averageSalePrice: 45, averageUnitCost: 12, advertisingCategoryIds: ["ads"], productPurchaseCategoryIds: [], salesCategoryIds: [] } }));
  assert.equal(app.render().stores[0].profitSettings, undefined);
});

test("a snapshot arriving before addTransaction resolves does not double the balance", async () => {
  const app = harness(); const data = app.online({ orders: [], transactions: [] });
  const pending = data.addTransaction({ storeId: "s1", categoryId: "sales", title: "Sale", type: "income", amount: 100, date: "2026-10-27" });
  const entry = [...app.cloud].find(([path]) => path.startsWith("transactions/"));
  app.emit("transactions", [{ id: entry[0].split("/")[1], ...entry[1] }]);
  await pending;
  assert.equal(app.render().transactions.length, 1);
  assert.equal(app.render().transactions.reduce((sum, record) => sum + record.amount, 0), 100);
});
