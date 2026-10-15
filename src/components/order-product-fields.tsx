"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/format";
import { getOrderItems } from "@/lib/order-items";
import type { Order, OrderItemInput, Product, Store } from "@/lib/types";
import { Field } from "./modal";

type ProductLine = { key: number; productId: string; quantity: string; unitPrice: number; product: string };

export function submittedOrderItems(data: FormData): OrderItemInput[] {
  const quantities = data.getAll("itemQuantity");
  return data.getAll("itemProductId").map((value, index) => ({ productId: String(value), quantity: Number(quantities[index]) }));
}

export function OrderProductFields({ products, order, submitting, currency }: { products: Product[]; order?: Order; submitting: boolean; currency: Store["currency"] }) {
  const originalItems = getOrderItems(order ?? null);
  const legacy = Boolean(order && !originalItems.length);
  const [rows, setRows] = useState<ProductLine[]>(() => originalItems.length ? originalItems.map((item, index) => ({ ...item, key: index, quantity: String(item.quantity), unitPrice: item.unitPrice ?? products.find((product) => product.id === item.productId)?.price ?? 0 })) : [{ key: 0, productId: "", quantity: "1", unitPrice: 0, product: "" }]);
  const nextKey = useRef(rows.length);
  const [amount, setAmount] = useState(order ? String(order.amount) : "");
  const cancelled = order?.status === "cancelled";
  const manual = legacy && rows.length === 1 && !rows[0].productId;
  const total = (lines: ProductLine[]) => Math.round(lines.reduce((sum, line) => sum + line.unitPrice * Number(line.quantity), 0) * 100) / 100;
  const updateRows = (lines: ProductLine[]) => {
    setRows(lines);
    setAmount(legacy && lines.length === 1 && !lines[0].productId ? String(order!.amount) : String(total(lines)));
  };
  const changeRow = (key: number, fields: Partial<ProductLine>) => updateRows(rows.map((line) => line.key === key ? { ...line, ...fields } : line));
  const subtotal = total(rows);

  return <>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-[#a7b1ba]">Sipariş ürünleri</p><span className="text-[9px] text-[#78838d]">{rows.filter((line) => line.productId).length} ürün satırı</span></div>
      {rows.map((line, index) => {
        const selected = products.find((product) => product.id === line.productId);
        const reserved = order?.stockDeducted ? originalItems.filter((item) => item.productId === line.productId).reduce((sum, item) => sum + item.quantity, 0) : 0;
        const otherQuantity = rows.filter((item) => item.key !== line.key && item.productId === line.productId).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const available = Math.max(0, (selected?.stock ?? 0) + reserved - otherQuantity);
        return <div key={line.key} className="rounded-xl border border-[#29333c] bg-[#0c1116] p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[9px] font-semibold text-[#89939f]">Ürün {index + 1}</p><button type="button" disabled={submitting || rows.length === 1} onClick={() => updateRows(rows.filter((item) => item.key !== line.key))} aria-label={`Ürün ${index + 1} satırını kaldır`} className="rounded-lg p-1.5 text-[#ff887d] hover:bg-white/[.04] disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={13}/></button></div>
          <Field label="Ürün"><select aria-label={`Ürün ${index + 1}`} required={!manual} disabled={submitting} name="itemProductId" value={line.productId} onChange={(event) => {
            const product = products.find((item) => item.id === event.target.value);
            changeRow(line.key, { productId: event.target.value, unitPrice: product?.price ?? 0, product: product?.name ?? "" });
          }} className="input"><option value="">{manual ? "Eski kayıt · stok takibi yok" : "Ürün seçin"}</option>{line.productId && !selected && <option value={line.productId}>{line.product || "Kayıtlı ürün"} · ürün bulunamadı</option>}{products.map((product) => {
            const original = originalItems.some((item) => item.productId === product.id);
            const usedElsewhere = rows.some((item) => item.key !== line.key && item.productId === product.id);
            return <option key={product.id} value={product.id} disabled={usedElsewhere || (!original && (!product.active || (!cancelled && product.stock === 0)))}>{product.name}{product.sku ? ` (${product.sku})` : ""} · {product.stock} stok{!product.active ? " · Satışa kapalı" : ""}</option>;
          })}</select></Field>
          <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Adet"><input aria-label={`Adet ${index + 1}`} required={!manual} disabled={submitting} type="number" name="itemQuantity" min="1" max={selected && !cancelled ? available : undefined} step="1" value={line.quantity} onChange={(event) => changeRow(line.key, { quantity: event.target.value })} className="input"/></Field><div className="pt-1 text-right"><p className="text-[8px] text-[#78838d]">Satır toplamı</p><p className="mt-2 text-[13px] font-semibold text-[#68ddcd]">{money(Math.round(line.unitPrice * (Number(line.quantity) || 0) * 100) / 100, currency)}</p></div></div>
          {selected && <p className="mt-2 text-[9px] text-[#89939f]">Birim fiyat: {money(line.unitPrice, currency)} · {cancelled ? `Mevcut stok: ${selected.stock}` : `Kullanılabilir: ${available}`} adet</p>}
        </div>;
      })}
      <button type="button" disabled={submitting} onClick={() => updateRows([...rows, { key: nextKey.current++, productId: "", quantity: "1", unitPrice: 0, product: "" }])} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#3c655e] py-2.5 text-[10px] font-semibold text-[#8ccfc5] hover:bg-[#14231f] disabled:opacity-50"><Plus size={14}/>Ürün ekle</button>
    </div>
    {manual && <Field label="Verdiği sipariş"><textarea required disabled={submitting} name="product" defaultValue={order?.product} className="input min-h-16 resize-none"/></Field>}
    {!manual && <div className="flex items-center justify-between rounded-xl bg-[#14231f] px-3 py-2.5 text-[10px]"><span className="text-[#899f99]">Ürünler toplamı</span><strong className="text-[#68ddcd]">{money(Number.isFinite(subtotal) ? subtotal : 0, currency)}</strong></div>}
    <Field label={`Sipariş tutarı (${currency})`}><input required disabled={submitting} min="0.01" step="0.01" type="number" name="amount" value={amount} onChange={(event) => setAmount(event.target.value)} className="input" placeholder="0,00"/></Field>
    {!manual && <p className="text-[10px] leading-5 text-[#89939f]">Paket indirimi için sipariş tutarını değiştirebilirsiniz. {cancelled ? "İptal edilen siparişin ürünleri stoktan düşmez." : order ? "Ürün veya adet değişince her ürünün stok farkı uygulanır." : "Sipariş kaydedilince her ürün kendi stoğundan düşülür."}</p>}
  </>;
}
