import { getOrderItems } from "./order-items";
import type { Order, Product } from "./types";

export function orderStockChanges(previous: Order | null, next: Order | null) {
  const changes = new Map<string, number>();
  const add = (id: string, quantity: number) => {
    const total = (changes.get(id) ?? 0) + quantity;
    if (!Number.isSafeInteger(total)) throw new Error("Toplam adet geçerli bir tam sayı olmalıdır.");
    changes.set(id, total);
  };
  if (previous?.stockDeducted) for (const item of getOrderItems(previous)) add(item.productId, item.quantity);
  if (next) {
    if (next.items !== undefined && (!Array.isArray(next.items) || !next.items.length)) throw new Error("Siparişe en az bir ürün ekleyin.");
    for (const item of getOrderItems(next)) {
      if (!item.productId?.trim()) throw new Error("Her satır için bir ürün seçin.");
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Adet pozitif bir tam sayı olmalıdır.");
      if (next.status !== "cancelled") add(item.productId, -item.quantity);
    }
  }
  return changes;
}

export function applyStockChange(product: Product, delta: number, storeId: string) {
  if (product.storeId !== storeId) throw new Error("Ürün bu mağazaya ait değil.");
  if (delta < 0 && !product.active) throw new Error(`${product.name} satışa kapalı.`);
  const stock = product.stock + delta;
  if (!Number.isSafeInteger(stock) || stock < 0) throw new Error(`${product.name} için yeterli stok yok. Mevcut stok: ${product.stock}.`);
  return { ...product, stock, updatedAt: new Date().toISOString() };
}
