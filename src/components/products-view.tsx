"use client";

import { useRef, useState } from "react";
import { Boxes, PackagePlus, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import type { Product, Store } from "@/lib/types";
import { Field, Modal } from "./modal";

type Result = { persisted: boolean };
type Props = {
  store: Store;
  products: Product[];
  onAdd: (data: Pick<Product, "storeId" | "name" | "sku" | "price" | "stock">) => Promise<Result>;
  onUpdate: (id: string, data: Pick<Product, "name" | "sku" | "price" | "active">) => Promise<Result>;
  onStock: (id: string, delta: number) => Promise<Result>;
};

export function ProductsView({ store, products, onAdd, onUpdate, onStock }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<Product | "new" | null>(null);
  const [stockId, setStockId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const stockProduct = products.find((item) => item.id === stockId);
  const close = () => { if (!lock.current) { setEditor(null); setStockId(null); } };
  const run = async (job: () => Promise<Result>, message: string) => {
    if (lock.current) return;
    lock.current = true; setSubmitting(true);
    try {
      const result = await job();
      if (result.persisted) toast.success(message);
      else toast.info(`${message} (demo modu; değişiklikler bu oturumda geçerli).`);
      setEditor(null); setStockId(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "İşlem kaydedilemedi. Tekrar deneyin."); }
    finally { lock.current = false; setSubmitting(false); }
  };
  const term = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = products.filter((item) => `${item.name} ${item.sku}`.toLocaleLowerCase("tr-TR").includes(term) && (filter === "all" || (filter === "low" && item.stock > 0 && item.stock <= 5) || (filter === "empty" && item.stock === 0) || (filter === "inactive" && !item.active))).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const editing = editor && editor !== "new" ? editor : null;

  return <>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[20px] font-semibold tracking-[-.03em]">Ürünler ve stok</h2><p className="mt-1 text-[10px] text-[#77818b]">{store.name} ürünlerini oluşturun, stok ekleyin ve kalan adetleri takip edin.</p></div><button disabled={submitting} onClick={() => setEditor("new")} className="flex items-center gap-2 rounded-xl bg-[#2dd4bf] px-4 py-2.5 text-[10px] font-bold text-[#07110f] disabled:opacity-60"><Plus size={14}/>Yeni ürün</button></div>
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">{[{ label: "Ürün çeşidi", value: products.length }, { label: "Toplam stok", value: products.reduce((sum, item) => sum + item.stock, 0) }, { label: "Stoku tükenen", value: products.filter((item) => item.stock === 0).length }].map((item) => <div key={item.label} className="panel rounded-2xl p-4"><p className="text-[9px] text-[#77818b]">{item.label}</p><p className="mt-1 text-[20px] font-semibold">{item.value}</p></div>)}</div>
    <div className="panel rounded-2xl p-4"><div className="mb-4 flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search size={14} className="pointer-events-none absolute top-3.5 left-3 text-[#65717c]"/><input aria-label="Ürün ara" value={query} onChange={(event) => setQuery(event.target.value)} className="input" style={{ paddingLeft: "2.3rem" }} placeholder="Ürün adı veya kodu ara..."/></div><select aria-label="Stok filtresi" value={filter} onChange={(event) => setFilter(event.target.value)} className="input sm:max-w-[180px]"><option value="all">Tüm ürünler</option><option value="low">Az stok (1–5 adet)</option><option value="empty">Stoku tükenenler</option><option value="inactive">Satışa kapalı</option></select></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((product) => <article key={product.id} className="rounded-2xl border border-[#27313a] bg-[#10161c] p-4"><div className="flex items-start justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1a2828] text-[#6bd9cc]"><Boxes size={17}/></span><span className={`rounded-full px-2 py-1 text-[8px] ${product.active ? "bg-[#17302b] text-[#68ddcd]" : "bg-[#342d1c] text-[#f4b860]"}`}>{product.active ? "Satışa açık" : "Satışa kapalı"}</span></div><h3 className="mt-4 break-words text-[12px] font-semibold">{product.name}</h3><p className="mt-1 text-[9px] text-[#78838d]">{product.sku || "Ürün kodu yok"}</p><div className="mt-4 flex items-end justify-between border-t border-[#252e36] pt-3"><div><p className="text-[8px] text-[#78838d]">Kalan stok</p><p className={`mt-1 text-[22px] font-semibold ${product.stock === 0 ? "text-[#ff887d]" : product.stock <= 5 ? "text-[#f4b860]" : "text-[#68ddcd]"}`}>{product.stock}<span className="ml-1 text-[9px] font-normal text-[#78838d]">adet</span></p></div><div className="text-right"><p className="text-[8px] text-[#78838d]">Birim fiyat</p><p className="mt-1 text-[12px] font-semibold">{money(product.price, store.currency)}</p></div></div><div className="mt-4 flex gap-2"><button disabled={submitting} onClick={() => setStockId(product.id)} aria-label={`${product.name} stok işlemi`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#31514b] bg-[#14231f] py-2 text-[10px] text-[#8ccfc5] disabled:opacity-60"><PackagePlus size={13}/>Stok ekle / düzelt</button><button disabled={submitting} onClick={() => setEditor(product)} aria-label={`${product.name} ürününü düzenle`} className="rounded-lg border border-[#303840] px-3 py-2 text-[#89959f] disabled:opacity-60"><Pencil size={13}/></button></div></article>)}</div>
      {!filtered.length && <div className="py-12 text-center"><Boxes size={28} className="mx-auto text-[#4b5964]"/><p className="mt-3 text-[11px] text-[#a0aab3]">{products.length ? "Bu filtrelerde ürün yok" : "Henüz ürün eklenmedi"}</p><p className="mt-1 text-[10px] text-[#66717c]">{products.length ? "Aramayı veya stok filtresini değiştirebilirsiniz." : "Sipariş oluşturmak için ilk ürününüzü ekleyin."}</p></div>}
    </div>
    {editor && <Modal open onClose={close} title={editing ? "Ürünü düzenle" : "Yeni ürün"} description={`${store.name} mağazası için ürün bilgilerini girin.`}><form className="space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const fields = { name: String(data.get("name") ?? "").trim(), sku: String(data.get("sku") ?? "").trim(), price: Number(data.get("price")) };
      void run(() => editing ? onUpdate(editing.id, { ...fields, active: data.get("active") === "on" }) : onAdd({ ...fields, storeId: store.id, stock: Number(data.get("stock")) }), editing ? "Ürün güncellendi" : "Ürün oluşturuldu");
    }}><Field label="Ürün adı"><input autoFocus required disabled={submitting} name="name" defaultValue={editing?.name ?? ""} className="input" placeholder="Örn. Siyah deri çanta"/></Field><Field label="Ürün kodu (isteğe bağlı)"><input disabled={submitting} name="sku" defaultValue={editing?.sku ?? ""} className="input" placeholder="Örn. CANTA-01"/></Field><Field label={`Birim fiyat (${store.currency})`}><input required disabled={submitting} type="number" min="0" step="0.01" name="price" defaultValue={editing?.price ?? ""} className="input"/></Field>{!editing && <Field label="Başlangıç stoğu (adet)"><input required disabled={submitting} type="number" min="0" step="1" name="stock" defaultValue="0" className="input"/></Field>}{editing && <><label className="flex items-center gap-2 text-[11px] text-[#a7b1ba]"><input disabled={submitting} type="checkbox" name="active" defaultChecked={editing.active}/>Yeni siparişler için satışa açık</label><p className="text-[10px] leading-5 text-[#77818b]">Stok değişikliklerini “Stok ekle / düzelt” ile yapın. Ürün adı veya fiyatını değiştirmek mevcut siparişleri değiştirmez.</p></>}<button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Ürünü oluştur"}</button></form></Modal>}
    {stockProduct && <Modal open onClose={close} title="Stok işlemi" description={`${stockProduct.name} · Mevcut stok: ${stockProduct.stock} adet`}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const amount = Number(data.get("quantity")); void run(() => onStock(stockProduct.id, data.get("operation") === "remove" ? -amount : amount), "Stok güncellendi"); }}><Field label="İşlem"><select aria-label="İşlem" disabled={submitting} name="operation" className="input"><option value="add">Stok ekle</option><option value="remove">Stok azalt (sayım düzeltmesi)</option></select></Field><Field label="Adet"><input autoFocus required disabled={submitting} type="number" name="quantity" min="1" step="1" className="input"/></Field><p className="text-[10px] text-[#77818b]">Girilen adet mevcut stoğa eklenir veya stoktan çıkarılır.</p><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Kaydediliyor…" : "Stoğu güncelle"}</button></form></Modal>}
  </>;
}
