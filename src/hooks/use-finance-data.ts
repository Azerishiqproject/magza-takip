"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { demoCategories, demoStores, demoTransactions } from "@/lib/demo-data";
import type { Category, Order, OrderStage, Store, Transaction } from "@/lib/types";

const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function useFinanceData() {
  const [stores, setStores] = useState<Store[]>(demoStores);
  const [categories, setCategories] = useState<Category[]>(demoCategories);
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isDemo, setIsDemo] = useState(true);

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(collection(db, "stores"), (snapshot) => {
        if (!snapshot.empty) { setStores(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Store))); setIsDemo(false); }
      }, () => setIsDemo(true)),
      onSnapshot(collection(db, "categories"), (snapshot) => {
        if (!snapshot.empty) setCategories(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Category)));
      }, () => undefined),
      onSnapshot(collection(db, "transactions"), (snapshot) => {
        if (!snapshot.empty) setTransactions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction)));
      }, () => undefined),
      onSnapshot(collection(db, "orders"), (snapshot) => {
        setOrders(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Order)));
      }, () => undefined),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const addStore = async (store: Omit<Store, "id">) => {
    const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const existing = stores.find((item) => normalize(item.domain) === normalize(store.domain) || normalize(item.name) === normalize(store.name));
    if (existing) return existing;

    const documentId = normalize(store.domain).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();
    const local = { ...store, id: documentId };
    setStores((current) => [...current, local]);
    try { await setDoc(doc(db, "stores", documentId), store); setIsDemo(false); } catch { setIsDemo(true); }
    return local;
  };

  const addCategory = async (category: Omit<Category, "id">) => {
    const local = { ...category, id: crypto.randomUUID() };
    setCategories((current) => [...current, local]);
    try { await addDoc(collection(db, "categories"), category); } catch { setIsDemo(true); }
    return local;
  };

  const updateCategory = async (id: string, category: Omit<Category, "id">) => {
    const previous = categories.find((item) => item.id === id);
    setCategories((current) => current.map((item) => item.id === id ? { ...category, id } : item));
    if (previous?.type !== category.type) {
      setTransactions((current) => current.map((item) => item.categoryId === id ? { ...item, type: category.type } : item));
    }
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "categories", id), category, { merge: true });
      if (previous?.type !== category.type) {
        transactions.filter((item) => item.categoryId === id).forEach((item) => batch.update(doc(db, "transactions", item.id), { type: category.type }));
      }
      await batch.commit();
    } catch { setIsDemo(true); }
  };

  const addTransaction = async (transaction: Omit<Transaction, "id">) => {
    const local = { ...transaction, id: crypto.randomUUID() };
    setTransactions((current) => [local, ...current]);
    try { await addDoc(collection(db, "transactions"), transaction); } catch { setIsDemo(true); }
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
      setOrders((current) => current.map((item) => item.id === previous.orderId ? { ...item, ...orderChanges, updatedAt } : item));
    }
    return { persisted: !isDemo };
  };

  const addOrder = async (order: Pick<Order, "storeId" | "customerName" | "product" | "amount">) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const local: Order = { ...order, id, stage: "new", status: "active", createdAt: now, updatedAt: now };
    setOrders((current) => [local, ...current]);
    try { await setDoc(doc(db, "orders", id), { ...order, stage: "new", status: "active", createdAt: now, updatedAt: now }); } catch { setIsDemo(true); }
    return local;
  };

  const updateOrderStage = async (id: string, stage: OrderStage, details: Partial<Pick<Order, "responseNote" | "addressNote" | "shippingCost">> = {}) => {
    const updatedAt = new Date().toISOString();
    setOrders((current) => current.map((order) => order.id === id ? { ...order, ...details, stage, updatedAt } : order));
    try { await setDoc(doc(db, "orders", id), { ...details, stage, updatedAt }, { merge: true }); } catch { setIsDemo(true); }
  };

  const ensureOrderCategories = (storeId: string) => {
    const income: Category = { id: `${storeId}-order-income`, storeId, name: "Sipariş gelirleri", type: "income", color: "#2dd4bf" };
    const shipping: Category = { id: `${storeId}-shipping-expense`, storeId, name: "Kargo giderleri", type: "expense", color: "#f4b860" };
    setCategories((current) => {
      const additions = [income, shipping].filter((item) => !current.some((entry) => entry.id === item.id));
      return additions.length ? [...current, ...additions] : current;
    });
    return { income, shipping };
  };

  const editOrderDetails = async (id: string, details: Partial<Pick<Order, "responseNote" | "addressNote" | "shippingCost">>) => {
    const order = orders.find((item) => item.id === id);
    if (!order || order.status === "cancelled") return;
    const updatedAt = new Date().toISOString();
    setOrders((current) => current.map((item) => item.id === id ? { ...item, ...details, updatedAt } : item));

    const shippingChangedAfterDelivery = order.status === "completed" && details.shippingCost !== undefined;
    if (!shippingChangedAfterDelivery) {
      try { await setDoc(doc(db, "orders", id), { ...details, updatedAt }, { merge: true }); } catch { setIsDemo(true); }
      return;
    }

    const shippingCost = details.shippingCost ?? 0;
    const transactionId = `order-shipping-${id}`;
    const shipping = shippingCost > 0 ? ensureOrderCategories(order.storeId).shipping : null;
    const transaction: Transaction | null = shipping ? { id: transactionId, storeId: order.storeId, categoryId: shipping.id, type: "expense", title: `${order.customerName} — Kargo`, amount: shippingCost, date: localDate(new Date(order.completedAt ?? order.updatedAt)), note: `Sipariş kargosu: ${order.product}`, orderId: id } : null;
    setTransactions((current) => transaction ? [transaction, ...current.filter((item) => item.id !== transactionId)] : current.filter((item) => item.id !== transactionId));
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "orders", id), { ...details, updatedAt }, { merge: true });
      if (transaction && shipping) {
        const { id: shippingTransactionId, ...shippingTransactionData } = transaction;
        batch.set(doc(db, "categories", shipping.id), { storeId: shipping.storeId, name: shipping.name, type: shipping.type, color: shipping.color }, { merge: true });
        batch.set(doc(db, "transactions", shippingTransactionId), shippingTransactionData);
      } else batch.delete(doc(db, "transactions", transactionId));
      await batch.commit();
    } catch { setIsDemo(true); }
  };

  const completeOrder = async (id: string) => {
    const order = orders.find((item) => item.id === id);
    if (!order || order.status !== "active") return;
    const now = new Date().toISOString();
    const date = localDate();
    const { income, shipping } = ensureOrderCategories(order.storeId);
    const incomeTransaction: Transaction = { id: `order-income-${id}`, storeId: order.storeId, categoryId: income.id, type: "income", title: `${order.customerName} — ${order.product}`, amount: order.amount, date, note: "Teslim edilen sipariş", orderId: id };
    const shippingTransaction: Transaction | null = order.shippingCost && order.shippingCost > 0 ? { id: `order-shipping-${id}`, storeId: order.storeId, categoryId: shipping.id, type: "expense", title: `${order.customerName} — Kargo`, amount: order.shippingCost, date, note: `Sipariş kargosu: ${order.product}`, orderId: id } : null;
    setOrders((current) => current.map((item) => item.id === id ? { ...item, stage: "delivered", status: "completed", completedAt: now, updatedAt: now } : item));
    setTransactions((current) => [incomeTransaction, ...(shippingTransaction ? [shippingTransaction] : []), ...current.filter((item) => item.id !== incomeTransaction.id && item.id !== shippingTransaction?.id)]);
    try {
      const batch = writeBatch(db);
      const { id: incomeTransactionId, ...incomeTransactionData } = incomeTransaction;
      batch.set(doc(db, "categories", income.id), { storeId: income.storeId, name: income.name, type: income.type, color: income.color }, { merge: true });
      batch.set(doc(db, "categories", shipping.id), { storeId: shipping.storeId, name: shipping.name, type: shipping.type, color: shipping.color }, { merge: true });
      batch.set(doc(db, "transactions", incomeTransactionId), incomeTransactionData);
      if (shippingTransaction) {
        const { id: shippingTransactionId, ...shippingTransactionData } = shippingTransaction;
        batch.set(doc(db, "transactions", shippingTransactionId), shippingTransactionData);
      }
      batch.set(doc(db, "orders", id), { stage: "delivered", status: "completed", completedAt: now, updatedAt: now }, { merge: true });
      await batch.commit();
    } catch { setIsDemo(true); }
  };

  const cancelOrder = async (id: string, chargeShipping: boolean, cancellationNote = "") => {
    const order = orders.find((item) => item.id === id);
    if (!order || order.status !== "active") return;
    const now = new Date().toISOString();
    const date = localDate();
    const shouldChargeShipping = Boolean(chargeShipping && order.shippingCost && order.shippingCost > 0);
    const shipping = shouldChargeShipping ? ensureOrderCategories(order.storeId).shipping : null;
    const shippingTransaction: Transaction | null = shipping && order.shippingCost ? { id: `order-shipping-${id}`, storeId: order.storeId, categoryId: shipping.id, type: "expense", title: `${order.customerName} — İptal kargosu`, amount: order.shippingCost, date, note: cancellationNote || `İptal edilen sipariş: ${order.product}`, orderId: id } : null;
    setOrders((current) => current.map((item) => item.id === id ? { ...item, status: "cancelled", cancelledAt: now, updatedAt: now, cancellationNote, cancelledShippingCharged: Boolean(shippingTransaction) } : item));
    if (shippingTransaction) setTransactions((current) => [shippingTransaction, ...current.filter((item) => item.id !== shippingTransaction.id)]);
    try {
      const batch = writeBatch(db);
      if (shippingTransaction && shipping) {
        const { id: shippingTransactionId, ...shippingTransactionData } = shippingTransaction;
        batch.set(doc(db, "categories", shipping.id), { storeId: shipping.storeId, name: shipping.name, type: shipping.type, color: shipping.color }, { merge: true });
        batch.set(doc(db, "transactions", shippingTransactionId), shippingTransactionData);
      }
      batch.set(doc(db, "orders", id), { status: "cancelled", cancelledAt: now, updatedAt: now, cancellationNote, cancelledShippingCharged: Boolean(shippingTransaction) }, { merge: true });
      await batch.commit();
    } catch { setIsDemo(true); }
  };

  return { stores, categories, transactions, orders, isDemo, addStore, addCategory, updateCategory, addTransaction, updateTransaction, addOrder, updateOrderStage, editOrderDetails, completeOrder, cancelOrder };
}
