import { orderProductLabel } from "./order-items";
import type { Order, Transaction } from "./types";

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Preserve edited transaction dates and categories when an order is corrected.
export function reconcileOrderTransactions(order: Order, previous: Order, transactions: Transaction[]) {
  const incomeId = `order-income-${order.id}`;
  const shippingId = `order-shipping-${order.id}`;
  const income = transactions.find((item) => item.id === incomeId);
  const shipping = transactions.find((item) => item.id === shippingId);
  const date = localDate(new Date(order.completedAt ?? order.cancelledAt ?? order.createdAt));
  const renamed = order.customerName !== previous.customerName || order.product !== previous.product;
  const quantityChanged = orderProductLabel(order) !== orderProductLabel(previous);
  const productLabel = orderProductLabel(order);
  const result: Transaction[] = [];
  if (order.status === "completed") {
    result.push({
      id: incomeId, storeId: order.storeId, categoryId: income?.categoryId ?? `${order.storeId}-order-income`,
      type: "income", date: income?.date ?? date, note: income?.note ?? "Teslim edilen sipariş", orderId: order.id,
      title: income && !renamed && !quantityChanged ? income.title : `${order.customerName} — ${productLabel}`, amount: order.amount,
    });
  }
  if ((order.status === "completed" || (order.status === "cancelled" && order.cancelledShippingCharged)) && (order.shippingCost ?? 0) > 0) {
    result.push({
      id: shippingId, storeId: order.storeId, categoryId: shipping?.categoryId ?? `${order.storeId}-shipping-expense`,
      type: "expense", date: shipping?.date ?? date, orderId: order.id, amount: order.shippingCost!,
      title: shipping && !renamed ? shipping.title : `${order.customerName} — ${order.status === "cancelled" ? "İptal kargosu" : "Kargo"}`,
      note: order.status === "cancelled" ? order.cancellationNote || `İptal edilen sipariş: ${order.product}` : renamed ? `Sipariş kargosu: ${order.product}` : shipping?.note ?? `Sipariş kargosu: ${order.product}`,
    });
  }
  return result;
}
