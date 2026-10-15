export type TransactionType = "income" | "expense";

export interface Store {
  id: string;
  name: string;
  domain: string;
  currency: "TRY" | "USD" | "EUR" | "AZN";
  status: "active" | "paused";
  color: string;
  folderId?: string | null;
}

export interface StoreFolder {
  id: string;
  name: string;
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
  orderId?: string;
}

export type OrderStage = "new" | "contacted" | "responded" | "addressed" | "delivered";
export type OrderStatus = "active" | "completed" | "cancelled";

export interface Product {
  id: string;
  storeId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderItem extends OrderItemInput {
  product: string;
  unitPrice?: number;
}

export interface Order {
  id: string;
  storeId: string;
  customerName: string;
  product: string;
  productId?: string | null;
  quantity?: number;
  stockDeducted?: boolean;
  items?: OrderItem[];
  amount: number;
  stage: OrderStage;
  status: OrderStatus;
  responseNote?: string;
  addressNote?: string;
  shippingCost?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationNote?: string;
  cancelledShippingCharged?: boolean;
}

export type Period = "day" | "week" | "month" | "year" | "custom";

export type NewOrder = Pick<Order, "storeId" | "customerName" | "amount"> & (OrderItemInput | { items: OrderItemInput[] });
export type OrderChanges = Partial<Pick<Order, "customerName" | "product" | "productId" | "quantity" | "amount" | "responseNote" | "addressNote" | "shippingCost" | "cancellationNote" | "cancelledShippingCharged">> & { items?: OrderItemInput[] };
