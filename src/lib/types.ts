export type TransactionType = "income" | "expense";

export interface Store {
  id: string;
  name: string;
  domain: string;
  currency: "TRY" | "USD" | "EUR" | "AZN";
  status: "active" | "paused";
  color: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  type: TransactionType;
  color: string;
}

export interface Transaction {
  id: string;
  storeId: string;
  categoryId: string;
  type: TransactionType;
  title: string;
  amount: number;
  date: string;
  note?: string;
}

export type Period = "day" | "week" | "month" | "year" | "custom";
