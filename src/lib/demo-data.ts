import type { Category, Store, Transaction } from "./types";

export const demoStores: Store[] = [
  { id: "north-atelier", name: "North Atelier", domain: "northatelier.com", currency: "AZN", status: "active", color: "#2dd4bf" },
  { id: "luna-home", name: "Luna Home", domain: "lunahome.store", currency: "AZN", status: "active", color: "#57b8ff" },
  { id: "vera", name: "Vera Objects", domain: "veraobjects.co", currency: "USD", status: "active", color: "#f4b860" },
];

export const demoCategories: Category[] = [
  { id: "sales", storeId: "north-atelier", name: "Ürün satışları", type: "income", color: "#2dd4bf" },
  { id: "refund", storeId: "north-atelier", name: "Diğer gelir", type: "income", color: "#57b8ff" },
  { id: "ads", storeId: "north-atelier", name: "Reklam", type: "expense", color: "#ff7a6b" },
  { id: "shipping", storeId: "north-atelier", name: "Kargo", type: "expense", color: "#f4b860" },
  { id: "product", storeId: "north-atelier", name: "Ürün maliyeti", type: "expense", color: "#69a7ff" },
  { id: "software", storeId: "north-atelier", name: "Yazılım", type: "expense", color: "#a7b0ba" },
];

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const demoTransactions: Transaction[] = Array.from({ length: 64 }, (_, i) => {
  const income = i % 3 !== 0;
  const expenseCategories = ["ads", "shipping", "product", "software"];
  const amount = income ? 1650 + ((i * 787) % 4200) : 380 + ((i * 431) % 2100);
  return {
    id: `demo-${i}`,
    storeId: "north-atelier",
    categoryId: income ? (i % 8 === 0 ? "refund" : "sales") : expenseCategories[i % expenseCategories.length],
    type: income ? "income" : "expense",
    title: income ? (i % 8 === 0 ? "Ek gelir" : `Shopify siparişleri #${1048 - i}`) : ["Meta reklam harcaması", "Kargo ödemesi", "Tedarikçi ödemesi", "Shopify aboneliği"][i % 4],
    amount,
    date: day(-i),
    note: income ? "Online mağaza" : undefined,
  };
});
