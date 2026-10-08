import type { Order, Product } from "./types";

export function orderStockChanges(previous: Order | null, next: Order | null) {
  const changes = new Map<string, number>();
  const add = (id: string, quantity: number) => changes.set(id, (changes.get(id) ?? 0) + quantity);
  if (previous?.productId && previous.stockDeducted) add(previous.productId, previous.quantity ?? 1);
  if (next?.productId) {
    if (!Number.isSafeInteger(next.quantity) || next.quantity! <= 0) throw new Error("Adet pozitif bir tam sayı olmalıdır.");
    if (next.status !== "cancelled") add(next.productId, -next.quantity!);
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
