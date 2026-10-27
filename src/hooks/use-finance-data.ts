"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, runTransaction, setDoc, where, writeBatch, type Transaction as FirestoreTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { demoCategories, demoProducts, demoStores, demoTransactions } from "@/lib/demo-data";
import type { Category, Order, OrderChanges, OrderStage, NewOrder, Product, Store, StoreFolder, Transaction } from "@/lib/types";

import { reconcileOrderTransactions } from "@/lib/order-transactions";
import { getOrderItems } from "@/lib/order-items";
import { applyStockChange, orderStockChanges } from "@/lib/order-stock";
import { validateProfitSettings } from "@/lib/profitability";

export function useFinanceData() {
  const [stores, setStores] = useState<Store[]>(demoStores);
  const [folders, setFolders] = useState<StoreFolder[]>([]);
  const [categories, setCategories] = useState<Category[]>(demoCategories);
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const inventoryRef = useRef<{ orders: Order[]; products: Product[] }>({ orders: [], products: demoProducts });
  const syncOrders = (update: (current: Order[]) => Order[]) => { inventoryRef.current.orders = update(inventoryRef.current.orders); setOrders(inventoryRef.current.orders); };
  const syncProducts = (update: (current: Product[]) => Product[]) => { inventoryRef.current.products = update(inventoryRef.current.products); setProducts(inventoryRef.current.products); };
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return;
    const unsubscribers = [
      onSnapshot(collection(db, "stores"), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;
        setStores(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Store))); setIsDemo(false);
      }, () => setIsDemo(true)),
      onSnapshot(collection(db, "storeFolders"), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;
        setFolders(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as StoreFolder)));
      }, () => undefined),
      onSnapshot(collection(db, "categories"), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;
        setCategories(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Category)));
      }, () => undefined),
      onSnapshot(collection(db, "transactions"), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;
        setTransactions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction)));
      }, () => undefined),
      onSnapshot(collection(db, "products"), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;
        syncProducts(() => snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Product)));
      }, () => undefined),
      onSnapshot(collection(db, "orders"), { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;
        syncOrders(() => snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Order)));
      }, () => undefined),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const addStore = async (store: Omit<Store, "id">) => {
    store = { ...store, name: store.name.trim(), domain: store.domain.trim() };
    if (!store.name || !store.domain) throw new Error("Mağaza adı ve domaini girin.");
    validateFolder(store.folderId);
    const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const existing = stores.find((item) => normalize(item.domain) === normalize(store.domain) || normalize(item.name) === normalize(store.name));
    if (existing) return existing;

    const documentId = normalize(store.domain).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
    if (store.profitSettings) validateProfitSettings(store.profitSettings, documentId, categories);
    const local = { ...store, id: documentId };
    if (!isDemo) await setDoc(doc(db, "stores", documentId), store);
    setStores((current) => [...current.filter((item) => item.id !== local.id), local]);
    return local;
  };

  const validateFolder = (folderId?: string | null) => {
    if (folderId && !folders.some((item) => item.id === folderId)) throw new Error("Klasör bulunamadı.");
  };

  const saveFolder = async (name: string, id = crypto.randomUUID()) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Klasör adı girin.");
    if (folders.some((item) => item.id !== id && item.name.toLocaleLowerCase("tr-TR") === trimmed.toLocaleLowerCase("tr-TR"))) throw new Error("Bu isimde bir klasör zaten var.");
    const folder = { id, name: trimmed };
    if (!isDemo) await setDoc(doc(db, "storeFolders", id), { name: trimmed });
    setFolders((current) => [...current.filter((item) => item.id !== id), folder]);
    return { persisted: !isDemo };
  };

  const deleteFolder = async (id: string) => {
    if (!isDemo) {
      const members = await getDocs(query(collection(db, "stores"), where("folderId", "==", id)));
      for (let offset = 0; offset < Math.max(members.docs.length, 1); offset += 450) {
        const batch = writeBatch(db);
        members.docs.slice(offset, offset + 450).forEach((item) => batch.update(item.ref, { folderId: null }));
        if (offset + 450 >= members.docs.length) batch.delete(doc(db, "storeFolders", id));
        await batch.commit();
      }
    }
    setStores((current) => current.map((item) => item.folderId === id ? { ...item, folderId: null } : item));
    setFolders((current) => current.filter((item) => item.id !== id));
    return { persisted: !isDemo };
  };

  const updateStore = async (id: string, changes: Partial<Omit<Store, "id">>) => {
    const previous = stores.find((item) => item.id === id);
    if (!previous) throw new Error("Mağaza bulunamadı.");
    const store = { ...previous, ...changes };
    if (changes.profitSettings) validateProfitSettings(changes.profitSettings, id, categories);
    store.name = store.name.trim(); store.domain = store.domain.trim();
    if (!store.name || !store.domain) throw new Error("Mağaza adı ve domaini girin.");
    validateFolder(store.folderId);
    const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (stores.some((item) => item.id !== id && (normalize(item.name) === normalize(store.name) || normalize(item.domain) === normalize(store.domain)))) throw new Error("Bu ad veya domain başka bir mağazada kullanılıyor.");
    if (store.currency !== previous.currency && (transactions.some((item) => item.storeId === id) || orders.some((item) => item.storeId === id) || products.some((item) => item.storeId === id))) throw new Error("Kayıt içeren mağazanın para birimi değiştirilemez.");
    if (!isDemo) {
      const { id: storeId, ...data } = store;
      await setDoc(doc(db, "stores", storeId), data);
    }
    setStores((current) => current.map((item) => item.id === id ? store : item));
    return { persisted: !isDemo };
  };

  const deleteStore = async (id: string) => {
    if (!stores.some((item) => item.id === id)) throw new Error("Mağaza bulunamadı.");
    if (!isDemo) {
      // Read the server too so records outside the current snapshot are removed.
      const collections = await Promise.all(["orders", "transactions", "categories", "products"].map((name) => getDocs(query(collection(db, name), where("storeId", "==", id)))));
      const references = [...collections.flatMap((snapshot) => snapshot.docs.map((item) => item.ref)), doc(db, "stores", id)];
      for (let offset = 0; offset < references.length; offset += 450) {
        const batch = writeBatch(db);
        references.slice(offset, offset + 450).forEach((reference) => batch.delete(reference));
        await batch.commit();
      }
    }
    setStores((current) => current.filter((item) => item.id !== id));
    syncOrders((current) => current.filter((item) => item.storeId !== id));
    syncProducts((current) => current.filter((item) => item.storeId !== id));
    setTransactions((current) => current.filter((item) => item.storeId !== id));
    setCategories((current) => current.filter((item) => item.storeId !== id));
    return { persisted: !isDemo };
  };

  const addCategory = async (category: Omit<Category, "id">) => {
    const local = { ...category, id: crypto.randomUUID() };
    if (!isDemo) await setDoc(doc(db, "categories", local.id), category);
    setCategories((current) => [...current.filter((item) => item.id !== local.id), local]);
    return local;
  };

  const updateCategory = async (id: string, category: Omit<Category, "id">) => {
    const previous = categories.find((item) => item.id === id);
    if (!isDemo) {
      const batch = writeBatch(db);
      batch.set(doc(db, "categories", id), category, { merge: true });
      if (previous?.type !== category.type) {
        transactions.filter((item) => item.categoryId === id).forEach((item) => batch.update(doc(db, "transactions", item.id), { type: category.type }));
      }
      await batch.commit();
    }
    setCategories((current) => current.map((item) => item.id === id ? { ...category, id } : item));
    if (previous?.type !== category.type) {
      setTransactions((current) => current.map((item) => item.categoryId === id ? { ...item, type: category.type } : item));
    }
  };

  const addTransaction = async (transaction: Omit<Transaction, "id">) => {
    const local = { ...transaction, id: crypto.randomUUID() };
    if (!isDemo) await setDoc(doc(db, "transactions", local.id), transaction);
    setTransactions((current) => [local, ...current.filter((item) => item.id !== local.id)]);
    return local;
  };

  const updateTransaction = async (id: string, changes: Pick<Transaction, "title" | "amount" | "date" | "categoryId" | "type" | "note">) => {
    const previous = transactions.find((item) => item.id === id);
    if (!previous) throw new Error("İşlem bulunamadı. Listeyi yenileyip tekrar deneyin.");
    const category = categories.find((item) => item.id === changes.categoryId && item.storeId === previous.storeId && item.type === changes.type);
    if (!category || !changes.title.trim() || !Number.isFinite(changes.amount) || changes.amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(changes.date) || Number.isNaN(new Date(`${changes.date}T12:00:00`).getTime())) {
      throw new Error("İşlem adı, tutar, tarih ve kategoriyi kontrol edin.");
    }
    if (previous.orderId && changes.type !== previous.type) throw new Error("Siparişe bağlı işlemin türü değiştirilemez.");

    const data = { title: changes.title.trim(), amount: changes.amount, date: changes.date, categoryId: changes.categoryId, type: changes.type, note: changes.note ?? "" };
    const orderChanges = previous.orderId && previous.amount !== data.amount
      ? id === `order-income-${previous.orderId}` ? { amount: data.amount }
        : id === `order-shipping-${previous.orderId}` ? { shippingCost: data.amount } : null
      : null;
    const updatedAt = new Date().toISOString();

    if (!isDemo) {
      const batch = writeBatch(db);
      batch.update(doc(db, "transactions", id), data);
      if (previous.orderId && orderChanges) batch.update(doc(db, "orders", previous.orderId), { ...orderChanges, updatedAt });
      await batch.commit();
    }
    setTransactions((current) => current.map((item) => item.id === id ? { ...item, ...data } : item));
    if (previous.orderId && orderChanges) {
      syncOrders((current) => current.map((item) => item.id === previous.orderId ? { ...item, ...orderChanges, updatedAt } : item));
    }
    return { persisted: !isDemo };
  };

  const validateProduct = (product: Pick<Product, "name" | "sku" | "price">) => {
    if (!product.name.trim() || !Number.isFinite(product.price) || product.price < 0) throw new Error("Ürün adı ve fiyatını kontrol edin.");
  };

  const addProduct = async (data: Pick<Product, "storeId" | "name" | "sku" | "price" | "stock">) => {
    validateProduct(data);
    if (!stores.some((item) => item.id === data.storeId)) throw new Error("Mağaza bulunamadı.");
    if (!Number.isSafeInteger(data.stock) || data.stock < 0) throw new Error("Stok sıfır veya pozitif bir tam sayı olmalıdır.");
    const now = new Date().toISOString();
    const product: Product = { ...data, name: data.name.trim(), sku: data.sku.trim(), id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
    if (!isDemo) {
      const { id, ...fields } = product;
      await runTransaction(db, async (transaction) => {
        const storeSnapshot = await transaction.get(doc(db, "stores", data.storeId));
        if (!storeSnapshot.exists()) throw new Error("Mağaza bulunamadı.");
        transaction.set(doc(db, "products", id), fields);
      });
    }
    syncProducts((current) => [...current.filter((item) => item.id !== product.id), product]);
    return { persisted: !isDemo };
  };

  const updateProduct = async (id: string, changes: Pick<Product, "name" | "sku" | "price" | "active">) => {
    validateProduct(changes);
    const fields = { ...changes, name: changes.name.trim(), sku: changes.sku.trim(), updatedAt: new Date().toISOString() };
    if (!inventoryRef.current.products.some((item) => item.id === id)) throw new Error("Ürün bulunamadı.");
    if (!isDemo) {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(doc(db, "products", id));
        if (!snapshot.exists()) throw new Error("Ürün bulunamadı.");
        transaction.update(snapshot.ref, fields);
      });
    }
    syncProducts((current) => current.map((item) => item.id === id ? { ...item, ...fields } : item));
    return { persisted: !isDemo };
  };

  const adjustStock = async (id: string, delta: number) => {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error("Stok değişimi sıfırdan farklı bir tam sayı olmalıdır.");
    const change = (product: Product) => {
      const stock = product.stock + delta;
      if (!Number.isSafeInteger(stock) || stock < 0) throw new Error("Stok sıfırın altına düşemez.");
      return { ...product, stock, updatedAt: new Date().toISOString() };
    };
    let updated: Product;
    if (!isDemo) {
      updated = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(doc(db, "products", id));
        if (!snapshot.exists()) throw new Error("Ürün bulunamadı.");
        const product = change({ id: snapshot.id, ...snapshot.data() } as Product);
        transaction.update(snapshot.ref, { stock: product.stock, updatedAt: product.updatedAt });
        return product;
      });
    } else {
      const product = inventoryRef.current.products.find((item) => item.id === id);
      if (!product) throw new Error("Ürün bulunamadı.");
      updated = change(product);
    }
    syncProducts((current) => current.map((item) => item.id === id ? updated : item));
    return { persisted: !isDemo };
  };

  // The order, stock and financial records commit together. Each retry reads fresh stock.
  const mutateOrder = async (id: string, build: (previous: Order | null) => Order | null, deleting = false) => {
    const extraReferences = deleting && !isDemo
      ? (await getDocs(query(collection(db, "transactions"), where("orderId", "==", id)))).docs.map((item) => item.ref)
      : [];
    const publish = (result: { order: Order | null; updatedProducts: Product[]; linked: Transaction[]; newCategories: Category[] }) => {
      syncOrders((current) => result.order ? [result.order, ...current.filter((item) => item.id !== id)] : current.filter((item) => item.id !== id));
      syncProducts((current) => current.map((item) => result.updatedProducts.find((product) => product.id === item.id) ?? item));
      setCategories((current) => [...current.filter((item) => !result.newCategories.some((category) => category.id === item.id)), ...result.newCategories]);
      setTransactions((current) => [...result.linked, ...current.filter((item) => item.id !== `order-income-${id}` && item.id !== `order-shipping-${id}` && (!deleting || item.orderId !== id))]);
    };
    const execute = async (persistence?: FirestoreTransaction) => {
      const orderRef = doc(db, "orders", id);
      const snapshot = persistence ? await persistence.get(orderRef) : null;
      const previous = snapshot ? snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as Order : null : inventoryRef.current.orders.find((item) => item.id === id) ?? null;
      const order = build(previous);
      if (!order && !previous) throw new Error("Sipariş bulunamadı.");
      const storeId = (order ?? previous)!.storeId;
      if (order && !previous) {
        const storeSnapshot = persistence ? await persistence.get(doc(db, "stores", storeId)) : null;
        if (storeSnapshot ? !storeSnapshot.exists() : !stores.some((item) => item.id === storeId)) throw new Error("Mağaza bulunamadı.");
      }
      const deltas = orderStockChanges(previous, order);
      const nextItems = getOrderItems(order).map((item) => ({ ...item }));
      const previousItems = getOrderItems(previous);
      const productIds = new Set([...deltas.keys(), ...nextItems.map((item) => item.productId)]);
      const updatedProducts: Product[] = [];
      for (const productId of productIds) {
        const productSnapshot = persistence ? await persistence.get(doc(db, "products", productId)) : null;
        const product = productSnapshot ? productSnapshot.exists() ? { id: productSnapshot.id, ...productSnapshot.data() } as Product : null : inventoryRef.current.products.find((item) => item.id === productId);
        if (!product) throw new Error("Siparişin ürünü bulunamadı.");
        const updated = applyStockChange(product, deltas.get(productId) ?? 0, storeId);
        if (deltas.get(productId)) updatedProducts.push(updated);
        for (const item of nextItems.filter((entry) => entry.productId === productId)) {
          const original = previousItems.find((entry) => entry.productId === productId);
          item.product = original?.product ?? product.name;
          item.unitPrice = original?.unitPrice ?? product.price;
        }
        if (order?.productId === productId && previous?.productId !== productId) order.product = product.name;
      }
      if (order) {
        if (order.items !== undefined) {
          order.items = nextItems;
          order.product = nextItems.map((item) => item.product).join(" + ");
          order.productId = nextItems.length === 1 ? nextItems[0].productId : null;
          order.quantity = nextItems.reduce((sum, item) => sum + item.quantity, 0);
        }
        order.customerName = order.customerName.trim(); order.product = order.product.trim();
        order.stockDeducted = Boolean(nextItems.length && order.status !== "cancelled");
        if (!order.customerName || !order.product || !Number.isFinite(order.amount) || order.amount <= 0 || !Number.isFinite(order.shippingCost ?? 0) || (order.shippingCost ?? 0) < 0) throw new Error("Müşteri, ürün, sipariş tutarı ve kargo giderini kontrol edin.");
      }
      const financialSnapshots = persistence ? await Promise.all([`order-income-${id}`, `order-shipping-${id}`].map((transactionId) => persistence.get(doc(db, "transactions", transactionId)))) : null;
      const financialRecords = financialSnapshots ? financialSnapshots.filter((item) => item.exists()).map((item) => ({ id: item.id, ...item.data() } as Transaction)) : transactions;
      const linked = order ? reconcileOrderTransactions(order, previous ?? order, financialRecords) : [];
      const defaults: Category[] = [
        { id: `${storeId}-order-income`, storeId, name: "Sipariş gelirleri", type: "income", color: "#2dd4bf" },
        { id: `${storeId}-shipping-expense`, storeId, name: "Kargo giderleri", type: "expense", color: "#f4b860" },
      ];
      const newCategories: Category[] = [];
      for (const category of defaults.filter((item) => linked.some((record) => record.categoryId === item.id))) {
        const categorySnapshot = persistence ? await persistence.get(doc(db, "categories", category.id)) : null;
        if (categorySnapshot ? !categorySnapshot.exists() : !categories.some((item) => item.id === category.id)) newCategories.push(category);
      }
      if (persistence) {
        for (const product of updatedProducts) persistence.update(doc(db, "products", product.id), { stock: product.stock, updatedAt: product.updatedAt });
        if (order) { const { id: orderId, ...fields } = order; persistence.set(doc(db, "orders", orderId), fields); }
        else persistence.delete(orderRef);
        for (const category of newCategories) { const { id: categoryId, ...fields } = category; persistence.set(doc(db, "categories", categoryId), fields); }
        for (const record of linked) { const { id: transactionId, ...fields } = record; persistence.set(doc(db, "transactions", transactionId), fields); }
        for (const transactionId of [`order-income-${id}`, `order-shipping-${id}`]) if (!linked.some((item) => item.id === transactionId)) persistence.delete(doc(db, "transactions", transactionId));
        for (const reference of extraReferences) if (!reference.path.endsWith(`/order-income-${id}`) && !reference.path.endsWith(`/order-shipping-${id}`)) persistence.delete(reference);
      }
      const result = { order, updatedProducts, linked, newCategories };
      // Demo mutations publish synchronously so rapid submissions see the updated stock.
      if (!persistence) publish(result);
      return result;
    };
    const result = isDemo ? await execute() : await runTransaction(db, execute);
    if (!isDemo) publish(result);
    return { ...result, persisted: !isDemo };
  };

  const addOrder = async (data: NewOrder) => {
    if (!("items" in data) && !data.productId) throw new Error("Bir ürün seçin.");
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const selection = "items" in data ? { items: data.items.map((item) => ({ productId: item.productId, quantity: item.quantity, product: "" })) } : { productId: data.productId, quantity: data.quantity };
    const result = await mutateOrder(id, () => ({ storeId: data.storeId, customerName: data.customerName, amount: data.amount, ...selection, id, product: "", stage: "new", status: "active", createdAt: now, updatedAt: now }));
    return result.order!;
  };

  const updateOrder = async (id: string, changes: OrderChanges) => {
    const result = await mutateOrder(id, (previous) => {
      if (!previous) throw new Error("Sipariş bulunamadı.");
      if (previous.productId && "productId" in changes && !changes.productId) throw new Error("Stok takibi yapılan siparişten ürün kaldırılamaz.");
      const { items, ...fields } = changes;
      const next = { ...previous, ...fields, updatedAt: new Date().toISOString() };
      if (items !== undefined) next.items = items.map((item) => ({ productId: item.productId, quantity: item.quantity, product: "" }));
      else if (previous.items && ("productId" in changes || "quantity" in changes)) {
        if (previous.items.length !== 1) throw new Error("Paket siparişinin ürünlerini satır bazında düzenleyin.");
        next.items = [{ ...previous.items[0], productId: changes.productId ?? previous.items[0].productId, quantity: changes.quantity ?? previous.items[0].quantity }];
      }
      return next;
    });
    return { persisted: result.persisted };
  };

  const editOrderDetails = async (id: string, changes: OrderChanges) => { await updateOrder(id, changes); };
  const deleteOrder = async (id: string) => { const result = await mutateOrder(id, () => null, true); return { persisted: result.persisted }; };

  const updateOrderStage = async (id: string, stage: OrderStage, details: Partial<Pick<Order, "responseNote" | "addressNote" | "shippingCost">> = {}) => {
    await mutateOrder(id, (previous) => {
      if (!previous || previous.status !== "active") throw new Error("Devam eden sipariş bulunamadı.");
      const stages: OrderStage[] = ["new", "contacted", "responded", "addressed", "delivered"];
      if (stage === "delivered" || stages.indexOf(stage) !== stages.indexOf(previous.stage) + 1) throw new Error("Sipariş aşamasını kontrol edin.");
      return { ...previous, ...details, stage, updatedAt: new Date().toISOString() };
    });
  };

  const completeOrder = async (id: string) => {
    await mutateOrder(id, (previous) => {
      if (!previous || previous.status !== "active" || previous.stage !== "addressed") throw new Error("Sipariş teslimata hazır değil.");
      const now = new Date().toISOString();
      return { ...previous, stage: "delivered", status: "completed", completedAt: now, updatedAt: now };
    });
  };

  const cancelOrder = async (id: string, chargeShipping: boolean, cancellationNote = "") => {
    await mutateOrder(id, (previous) => {
      if (!previous || previous.status !== "active") throw new Error("Devam eden sipariş bulunamadı.");
      const now = new Date().toISOString();
      return { ...previous, status: "cancelled", stockDeducted: false, cancelledAt: now, updatedAt: now, cancellationNote, cancelledShippingCharged: Boolean(chargeShipping && (previous.shippingCost ?? 0) > 0) };
    });
  };

  return { stores, folders, products, addProduct, updateProduct, adjustStock, categories, transactions, orders, isDemo, addStore, updateStore, deleteStore, saveFolder, deleteFolder, updateOrder, deleteOrder, addCategory, updateCategory, addTransaction, updateTransaction, addOrder, updateOrderStage, editOrderDetails, completeOrder, cancelOrder };
}
