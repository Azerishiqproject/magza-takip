import { getOrderItems } from "./order-items";
import { commonLegacyPurchasePrice, legacyQuantity, validCostMapping } from "./legacy-sales";
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

export function calculateOrderProfitability(store: Store, order: Order, products: Product[], revenue = order.amount, sourceKey = `order:${order.id}`, stores: Store[] = [store]) {
  const productMap = new Map(products.filter((p) => p.storeId === store.id).map((p) => [p.id, p]));
  const mapping = store.profitSettings?.costMappings?.[sourceKey];
  const mapped = mapping && !("excluded" in mapping) && validCostMapping(mapping, products, store.id, stores) ? mapping : null;
  const items = mapped ? mapped.items.map((item) => ({ ...item, product: "productId" in item ? productMap.get(item.productId)?.name ?? "Ürün" : `${stores.find((s) => s.id === item.sourceStoreId)?.name ?? "Mağaza"} ortak alış fiyatı` })) : getOrderItems(order);
  const missingProducts = new Set<string>();
  let purchase = 0, units = 0;
  let legacyResolved = false;
  const packageCount = mapped?.packageCount ?? 1;
  if (order.storeId !== store.id || (mapping && !mapped)) missingProducts.add(order.product || "Ürün bağlantısı eksik");
  else if (order.items === undefined && !order.productId && !mapped) {
    const quantity = order.quantity ?? legacyQuantity(order.product, !sourceKey.startsWith("income:"));
    const cost = commonLegacyPurchasePrice(store, products);
    if (quantity !== null && Number.isSafeInteger(quantity) && quantity > 0 && validMoney(cost)) {
      purchase = moneyCents(cost) * quantity; units = quantity; legacyResolved = true;
    } else missingProducts.add(order.product || "Ürün/adet bağlantısı eksik");
  } else if (!Array.isArray(items) || !items.length) missingProducts.add(order.product || "Ürün bağlantısı eksik");
  else for (const item of items) {
    const product = "productId" in item ? productMap.get(item.productId) : undefined;
    const source = "sourceStoreId" in item ? stores.find((s) => s.id === item.sourceStoreId) : undefined;
    const cost = source && source.currency === store.currency ? commonLegacyPurchasePrice(source, products) : product?.purchasePrice;
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !validMoney(cost)) {
      missingProducts.add(item.product || product?.name || "Ürün bilgisi eksik");
      continue;
    }
    purchase += moneyCents(cost) * item.quantity;
    units += item.quantity;
  }
  if (!Number.isSafeInteger(purchase) || !Number.isSafeInteger(units)) missingProducts.add("Ürün adet veya maliyetini kontrol edin");
  const purchaseCost = missingProducts.size ? null : purchase / 100;
  const perPackageShipping = orderShippingCost(store, order);
  const shippingCost = perPackageShipping === null ? null : perPackageShipping * packageCount;
  const packagingCost = store.currency === "AZN" ? packageCount : 0;
  const total = purchaseCost === null || shippingCost === null ? null : purchase + moneyCents(shippingCost) + moneyCents(packagingCost);
  const totalCost = total === null || !Number.isSafeInteger(total) ? null : total / 100;
  const contribution = totalCost === null || !validMoney(revenue) ? null : (moneyCents(revenue) - moneyCents(totalCost)) / 100;
  return {
    units: missingProducts.size ? null : units, packageCount, purchaseCost, shippingCost, packagingCost, totalCost, contribution,
    legacyResolved: (legacyResolved || Boolean(mapped)) && totalCost !== null,
    breakEven: totalCost === null ? null : breakEvenRoas(revenue, totalCost),
    missingProducts: [...missingProducts], missingShipping: shippingCost === null,
  };
}
