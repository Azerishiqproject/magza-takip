import type { Order, OrderItem } from "./types";

// Read both bundle orders and orders saved before multiple products were supported.
export function getOrderItems(order: Order | null): OrderItem[] {
  if (!order) return [];
  if (order.items !== undefined) return order.items;
  return order.productId ? [{ productId: order.productId, product: order.product, quantity: order.quantity ?? 1, unitPrice: order.amount / (order.quantity ?? 1) }] : [];
}

export function orderProductLabel(order: Order) {
  const items = getOrderItems(order);
  return items.length ? items.map((item) => `${item.product} × ${item.quantity}`).join(" + ") : order.product;
}
