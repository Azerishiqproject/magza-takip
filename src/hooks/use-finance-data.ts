"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { demoCategories, demoStores, demoTransactions } from "@/lib/demo-data";
import type { Category, Store, Transaction } from "@/lib/types";

export function useFinanceData() {
  const [stores, setStores] = useState<Store[]>(demoStores);
  const [categories, setCategories] = useState<Category[]>(demoCategories);
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
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

  return { stores, categories, transactions, isDemo, addStore, addCategory, updateCategory, addTransaction };
}
