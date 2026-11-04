import { getOrderItems } from "./order-items";
import type { Order, Product, Store } from "./types";

export const moneyCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
export const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(moneyCents(value)) && Math.abs(value - moneyCents(value) / 100) < 1e-8;

export function breakEvenRoas(salePrice: number, cost: number): number | null {
  return validMoney(salePrice) && salePrice > 0 && validMoney(cost) && moneyCents(salePrice) > moneyCents(cost) ? moneyCents(salePrice) / (moneyCents(salePrice) - moneyCents(cost)) : null;
}

// Each package pays shipping once. Never treat 4 AZN as another currency.
export function orderShippingCost(store: Store, order: Order): number | null {
  return store.currency === "AZN" ? 4 : validMoney(order.shippingCost) ? order.shippingCost : null;
}

export function calculateOrderProfitability(store: Store, order: Order, products: Product[], revenue = order.amount) {
  const productMap = new Map(products.filter((p) => p.storeId === store.id).map((p) => [p.id, p]));
  const items = getOrderItems(order);
  const missingProducts = new Set<string>();
  let purchase = 0, units = 0;
  if (order.storeId !== store.id || !Array.isArray(items) || !items.length) missingProducts.add(order.product || "Ürün bağlantısı eksik");
  else for (const item of items) {
    const product = productMap.get(item.productId);
    const cost = product?.purchasePrice;
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !validMoney(cost)) {
      missingProducts.add(item.product || product?.name || "Ürün bilgisi eksik");
      continue;
    }
    purchase += moneyCents(cost) * item.quantity;
    units += item.quantity;
  }
  if (!Number.isSafeInteger(purchase) || !Number.isSafeInteger(units)) missingProducts.add("Ürün adet veya maliyetini kontrol edin");
  const purchaseCost = missingProducts.size ? null : purchase / 100;
  const shippingCost = orderShippingCost(store, order);
  const packagingCost = store.currency === "AZN" ? 1 : 0;
  const total = purchaseCost === null || shippingCost === null ? null : purchase + moneyCents(shippingCost) + moneyCents(packagingCost);
  const totalCost = total === null || !Number.isSafeInteger(total) ? null : total / 100;
  const contribution = totalCost === null || !validMoney(revenue) ? null : (moneyCents(revenue) - moneyCents(totalCost)) / 100;
  return {
    units: missingProducts.size ? null : units, purchaseCost, shippingCost, packagingCost, totalCost, contribution,
    breakEven: totalCost === null ? null : breakEvenRoas(revenue, totalCost),
    missingProducts: [...missingProducts], missingShipping: shippingCost === null,
  };
}
