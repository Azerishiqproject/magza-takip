"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Profitability } from "@/lib/profitability";
import type { CostMappingItem, LegacyCostMapping, Product, ProfitSettings, Store } from "@/lib/types";
import { commonLegacyPurchasePrice } from "@/lib/legacy-sales";
import { validMoney } from "@/lib/order-profitability";
import { Field } from "./modal";

type Props = { stores: Store[]; store: Store; products: Product[]; issues: Profitability["costIssues"]; onSave: (settings: ProfitSettings) => Promise<{ persisted: boolean }> };

export function LegacyCostResolver({ store, stores, products, issues, onSave }: Props) {
  const [selected, setSelected] = useState(issues[0]?.sourceKey ?? "");
  const issue = issues.find((i) => i.sourceKey === selected) ?? issues[0];
  if (!issue) return null;
  return <details className="mb-4 mt-3 rounded-xl border border-[#715530] p-3 text-xs leading-6 text-[#d9bd94]">
    <summary className="cursor-pointer font-semibold">Eski kayıt eşleştirmeleri ({issues.length})</summary>
    <p className="mt-2 text-[11px] leading-5">Ürünü, adedi ve kaç ayrı paket gönderildiğini seçin. Alış fiyatı stoktan alınır. Başka mağazanın aynı maliyetli ürünleri için ortak alış fiyatı seçilebilir; para birimleri aynı olmalıdır. Bu eşleştirmeler yalnızca ROAS hesabında kullanılır.</p>
    <div className="mt-3"><Field label="Düzeltilecek kayıt"><select value={issue.sourceKey} onChange={(e) => setSelected(e.target.value)} className="input">{issues.map((i) => <option key={i.sourceKey} value={i.sourceKey}>{i.kind === "order" ? "Sipariş" : "Manuel gelir"} · {i.date} · {i.label} · {i.revenue} {store.currency}</option>)}</select></Field></div>
    <LegacyMappingEditor key={issue.sourceKey} issue={issue} store={store} stores={stores} products={products} onSave={onSave}/>
  </details>;
}

function LegacyMappingEditor({ issue, store, stores, products, onSave }: Omit<Props, "issues"> & { issue: Profitability["costIssues"][number] }) {
  const ownProducts = products.filter((p) => p.storeId === store.id);
  const costSources = stores.filter((s) => s.id !== store.id && s.currency === store.currency && validMoney(commonLegacyPurchasePrice(s, products)));
  const saved = store.profitSettings?.costMappings?.[issue.sourceKey];
  const [items, setItems] = useState<CostMappingItem[]>(saved && "items" in saved ? saved.items.map((i) => ({ ...i })) : [{ productId: ownProducts.length === 1 ? ownProducts[0].id : "", quantity: issue.suggestedQuantity ?? 1 }]);
  const [packages, setPackages] = useState(String(saved && "items" in saved ? saved.packageCount : issue.suggestedPackages));
  const [excluded, setExcluded] = useState(Boolean(saved && "excluded" in saved));
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  return <form className="mt-4 space-y-3" onSubmit={(event) => {
    event.preventDefault(); if (lock.current) return;
    const mapping: LegacyCostMapping = excluded ? { excluded: true } : { items, packageCount: Number(packages) };
    const settings: ProfitSettings = { advertisingCategoryIds: store.profitSettings?.advertisingCategoryIds ?? [], salesCategoryIds: store.profitSettings?.salesCategoryIds ?? [], costMappings: { ...store.profitSettings?.costMappings, [issue.sourceKey]: mapping } };
    lock.current = true; setSaving(true);
    void onSave(settings).then(({ persisted }) => toast.success(persisted ? "Eski kayıt eşleştirildi; ROAS güncellendi" : "Demo eşleştirmesi kaydedildi")).catch((error) => toast.error(error instanceof Error ? error.message : "Eşleştirme kaydedilemedi")).finally(() => { lock.current = false; setSaving(false); });
  }}>
    {issue.kind === "income" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={excluded} disabled={saving} onChange={(e) => setExcluded(e.target.checked)}/>Satış değil · ROAS hesabının dışında tut</label>}
    {!excluded && <>
      {items.map((item, index) => <div key={index} className="flex items-end gap-2"><div className="min-w-0 flex-1"><Field label={`Ürün ${index + 1}`}><select required disabled={saving} value={"productId" in item ? item.productId ? `product:${item.productId}` : "" : `store:${item.sourceStoreId}`} onChange={(e) => setItems(items.map((i, n) => n === index ? e.target.value.startsWith("store:") ? { sourceStoreId: e.target.value.slice(6), quantity: i.quantity } : { productId: e.target.value.slice(8), quantity: i.quantity } : i))} className="input"><option value="">Ürün seçin</option>{ownProducts.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name}</option>)}{costSources.map((s) => <option key={s.id} value={`store:${s.id}`}>{s.name} · ortak alış fiyatı ({commonLegacyPurchasePrice(s, products)} {s.currency})</option>)}</select></Field></div><div className="w-24"><Field label={`Adet ${index + 1}`}><input required disabled={saving} type="number" min="1" step="1" value={item.quantity || ""} onChange={(e) => setItems(items.map((i, n) => n === index ? { ...i, quantity: Number(e.target.value) } : i))} className="input"/></Field></div>{items.length > 1 && <button type="button" disabled={saving} onClick={() => setItems(items.filter((_, n) => n !== index))} aria-label={`Ürün ${index + 1} satırını kaldır`} className="mb-1 rounded-lg p-2"><X size={14}/></button>}</div>)}
      <button type="button" disabled={saving} onClick={() => setItems([...items, { productId: "", quantity: 1 }])} className="flex items-center gap-1 text-xs font-semibold"><Plus size={13}/>Ürün ekle</button>
      <Field label="Ayrı gönderilen paket sayısı"><input required disabled={saving || issue.kind === "order"} type="number" min="1" step="1" value={packages} onChange={(e) => setPackages(e.target.value)} className="input"/></Field>
      <p className="text-[11px] leading-5">Aynı siparişteki ürünler birlikte gönderildiyse 1 paket seçin. Eski bir manuel kayıt birden fazla ayrı siparişi topluyorsa gönderilen paket sayısını girin.</p>
    </>}
    <button disabled={saving} className="rounded-lg bg-[#e3bc7e] px-4 py-2 text-xs font-semibold text-[#251b0d] disabled:opacity-50">{saving ? "Kaydediliyor…" : "Eşleştir ve yeniden hesapla"}</button>
    {saved && <button type="button" disabled={saving} className="ml-3 text-xs underline disabled:opacity-50" onClick={() => {
      if (lock.current) return;
      const mappings = { ...store.profitSettings?.costMappings }; delete mappings[issue.sourceKey];
      lock.current = true; setSaving(true);
      void onSave({ ...store.profitSettings!, costMappings: mappings }).then(() => toast.success("Eşleştirme kaldırıldı")).catch((error) => toast.error(error instanceof Error ? error.message : "İşlem kaydedilemedi")).finally(() => { lock.current = false; setSaving(false); });
    }}>Eşleştirmeyi kaldır</button>}
  </form>;
}
