import type { LegacyCostMapping, OrderItemInput, Product, Store } from "./types";

export const normalizeLegacyLabel = (value: string) => value.trim().toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ə/g, "e").replace(/\s+/g, " ");

// Only explicit quantities are accepted. Never derive units from a sale amount,
// a location/customer name, or an order count that may contain bundled units.
export function legacyQuantity(label: string, allowBareNumber = true): number | null {
  const text = normalizeLegacyLabel(label);
  if (!allowBareNumber && /^\d+$/.test(text)) return null;
  const match = text.match(/^(\d+)\s*(?:(?:eded|adet|pcs)(?:\s+[^\d+×,;]*)?)?$/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

export function legacyPackageCount(label: string): number | null {
  const match = normalizeLegacyLabel(label).match(/^(\d+)\s*(?:sifaris|siparis)$/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function commonLegacyPurchasePrice(store: Store, products: Product[]): number | undefined {
  const own = products.filter((p) => p.storeId === store.id);
  if (!own.length || own.some((p) => p.purchasePrice === undefined || p.purchasePrice !== own[0].purchasePrice)) return undefined;
  // Equal-cost variants can be costed without inventing a historical SKU or
  // changing inventory. The caller still validates money and explicit quantity.
  return own[0].purchasePrice;
}

export function validCostMapping(mapping: LegacyCostMapping, products: Product[], storeId: string) {
  if (!mapping || typeof mapping !== "object") return false;
  if ("excluded" in mapping) return mapping.excluded === true;
  if (!Number.isSafeInteger(mapping.packageCount) || mapping.packageCount <= 0 || !Array.isArray(mapping.items) || !mapping.items.length) return false;
  let units = 0;
  for (const item of mapping.items as OrderItemInput[]) {
    if (!item || !products.some((p) => p.id === item.productId && p.storeId === storeId) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) return false;
    units += item.quantity;
  }
  return Number.isSafeInteger(units) && mapping.packageCount <= units;
}
