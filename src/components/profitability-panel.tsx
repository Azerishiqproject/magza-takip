"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Settings2, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { breakEvenRoas, calculateProfitability, suggestedProfitCategories, type Profitability } from "@/lib/profitability";
import { reportMoney } from "@/lib/store-analytics";
import type { Category, ProfitSettings, Store, Transaction } from "@/lib/types";
import { Field, Modal } from "./modal";

const ratio = (value: number | null) => value === null ? "—" : `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
type Data = { categories: Category[]; transactions: Transaction[] };
type Props = Data & { store: Store; onSave: (settings: ProfitSettings) => Promise<{ persisted: boolean }> };

export function ProfitabilityPanel({ store, categories, transactions, onSave }: Props) {
  const [editing, setEditing] = useState(!store.profitSettings);
  const result = useMemo(() => calculateProfitability(store, categories, transactions), [store, categories, transactions]);
  const positive = result.profit !== null && result.profit >= 0;
  const currency = store.currency;
  const amount = (value: number | null) => value === null ? "—" : reportMoney(value, currency);
  return <section aria-label={`${store.name} ROAS ve satış kârı`} className="mb-5 overflow-hidden rounded-2xl border border-[#2b413b] bg-[linear-gradient(120deg,#142822_0%,#10171c_55%,#10161c_100%)] p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-xs font-medium text-[#89c9b9]"><Target size={15}/>Satış kârlılığı</div><h3 className="mt-1.5 text-lg font-semibold tracking-tight">ROAS ve başa baş noktası</h3><p className="mt-1 text-xs leading-5 text-[#93a59e]">{store.name} · Seçili dönemin satışları ve kayıtlı giderleri</p></div>
      <button onClick={() => setEditing(true)} className="flex min-h-10 items-center gap-2 rounded-xl border border-[#3b554c] bg-[#14251f] px-3 text-xs font-medium text-[#a7e4d4] hover:bg-[#1a3028]"><Settings2 size={14}/>{result.configured ? "Maliyet ayarları" : "Maliyetleri ayarla"}</button>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-white/[.06] bg-[#0c1512]/60 p-4"><p className="flex items-center gap-2 text-xs text-[#a6b8af]"><TrendingUp size={14}/>Tahmini satış kârı</p><p className={`mt-3 break-words text-3xl font-semibold tracking-tight ${result.profit === null ? "text-[#c6ceca]" : positive ? "text-[#6ce0b4]" : "text-[#ff9b92]"}`}>{amount(result.profit)}</p><p className="mt-2 text-xs leading-5 text-[#93a59e]">Sipariş geliri − maliyet payı − reklam − diğer giderler</p></div>
      <div className="rounded-xl border border-white/[.06] bg-[#0c1318]/60 p-4"><p className="text-xs text-[#a6b8af]">Mevcut ROAS</p><p className="mt-3 text-3xl font-semibold tracking-tight text-[#8ce1d0]">{ratio(result.roas)}</p><p className="mt-2 text-xs leading-5 text-[#93a59e]">{result.noAdvertisingCategory ? "Reklam gideri kategorisini seçin." : result.roas === null ? "Seçili reklam kategorisinde bu dönem gider yok." : `1 ${currency} reklam → ${result.roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${currency} satış geliri`}</p></div>
      <div className="rounded-xl border border-white/[.06] bg-[#0c1318]/60 p-4"><p className="text-xs text-[#a6b8af]">Dönemin başa baş ROAS’ı</p><p className="mt-3 text-3xl font-semibold tracking-tight text-[#edc488]">{ratio(result.breakEven)}</p><p className="mt-2 text-xs leading-5 text-[#93a59e]">{result.noAdvertisingCategory ? "Reklam gideri kategorisini seçin." : result.noContribution ? "Reklam hariç maliyetler satış gelirini karşılamıyor." : !result.configured ? "Maliyet ve ortalama satış fiyatını girin." : result.revenue === 0 ? "Sipariş geliri oluştuğunda hesaplanır." : "Bu dönemin ürün ve diğer giderleriyle kârın sıfır olduğu eşik."}</p></div>
    </div>
    <RoasGauge result={result}/>
    {(!result.configured || result.noSalesCategory || result.noAdvertisingCategory) && <div className="mt-4 rounded-xl border border-[#5c4b2e] bg-[#282217]/60 px-4 py-3 text-xs leading-6 text-[#dfc18b]">
      {!result.configured ? "Kargo dahil ürün maliyetini ve ortalama satış fiyatını girerek kâr hesabını başlatın. " : ""}
      {result.noAdvertisingCategory ? "ROAS için reklam gideri kategorisini seçin. " : ""}
      {result.noSalesCategory ? "Bu mağazada henüz Sipariş gelirleri kategorisi yok. İlk teslimatla oluşur; ayarlardan başka bir gelir kategorisi de seçebilirsiniz." : ""}
    </div>}
    <details className="group mt-4 rounded-xl border border-white/[.07] bg-[#0d1417]/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-xs font-medium text-[#b7c8c0]">Hesap detayı ve ürün planı<ChevronDown size={14} className="transition group-open:rotate-180"/></summary>
      <div className="border-t border-white/[.06] p-4">
        <dl className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">{[["Satış geliri", amount(result.revenue)], ["Kargo dahil maliyet payı", amount(result.productCost)], ["Reklam gideri", result.noAdvertisingCategory ? "Kategori seçilmedi" : amount(result.adSpend)], ["Diğer giderler", amount(result.otherExpenses)]].map(([label, value]) => <div key={label}><dt className="text-[#8e9e97]">{label}</dt><dd className="mt-1.5 text-sm font-semibold text-[#d5e1da]">{value}</dd></div>)}</dl>
        <p className="mt-4 text-xs leading-6 text-[#93a59e]">Stok alımı olarak sınıflanan {amount(result.purchases)} gider bu hesapta tekrar düşülmez; yerine sipariş gelirine uygulanan maliyet oranı kullanılır. Diğer gelirler ({amount(result.otherIncome)}) satış ROAS’ına ve satış kârına dahil edilmez. Gelir-gider kayıtları değişmez. Kâr hesabı, girdiğiniz ortalama fiyat ve maliyete dayalı bir tahmindir; sipariş adedi kullanılmaz.</p>
        <p className="mt-2 text-xs leading-6 text-[#93a59e]">ROAS, tüm satış gelirinin reklam giderine oranıdır; reklam platformunun satış atfı değildir. Ürün maliyetini kargo dahil girin. Kayıtlı kargo giderleri ({amount(result.includedShipping)}) bu modelde tekrar düşülmez; dönem eşiği maliyet payını ve diğer giderleri içerir.</p>
        {store.profitSettings && <div className="mt-4 rounded-lg bg-white/[.035] p-3 text-xs leading-6 text-[#c6d5cc]"><span className="font-semibold">Ürün planı: {ratio(result.plannedBreakEven)}</span><br/>{amount(store.profitSettings.averageSalePrice)} satış fiyatı ÷ ({amount(store.profitSettings.averageSalePrice)} − {amount(store.profitSettings.averageUnitCost)} kargo dahil ürün maliyeti). {result.plannedBreakEven === null && "Bu fiyat ve maliyetlerle pozitif reklam bütçesi kalmıyor."} Kargo, girdiğiniz maliyete dahildir.</div>}
      </div>
    </details>
    {editing && <ProfitSettingsModal store={store} categories={categories} onClose={() => setEditing(false)} onSave={onSave}/>}
  </section>;
}

function RoasGauge({ result }: { result: Profitability }) {
  const maximum = Math.max(6, Math.ceil(Math.max(result.roas ?? 0, result.breakEven ?? 0) * 1.25));
  const threshold = result.breakEven === null ? null : result.breakEven / maximum * 100;
  const current = result.roas === null ? null : Math.max(1, Math.min(99, result.roas / maximum * 100));
  return <div className="mt-5 rounded-xl border border-white/[.07] bg-[#0b1214]/50 p-4" role="img" aria-label={`ROAS göstergesi. Başa baş ${ratio(result.breakEven)}, mevcut ${ratio(result.roas)}.`}>
    <div className="mb-6 flex flex-wrap justify-between gap-2 text-xs text-[#a7b7af]"><span>ROAS seviyesine göre durum</span><span className={result.profit !== null && result.profit >= 0 ? "text-[#7cdbb4]" : "text-[#efc183]"}>{result.profit === null ? "Maliyet ve fiyat bekleniyor" : result.revenue === 0 ? "Henüz satış yok" : result.profit > 0 ? "Kâr bölgesinde" : result.profit === 0 ? "Başa baş" : "Zarar bölgesinde"}</span></div>
    <div className="relative mx-1 h-4 rounded-full bg-[#33413c]" style={threshold === null ? undefined : { background: `linear-gradient(to right, #bd8d4d 0%, #bd8d4d ${threshold}%, #3e9277 ${threshold}%, #3e9277 100%)` }}>
      {threshold !== null && <span className="absolute -top-2 h-8 w-0.5 bg-[#efbd6f]" style={{ left: `${threshold}%` }}/>}
      {current !== null && <span className={`absolute -top-1.5 h-7 w-7 -translate-x-1/2 rounded-full border-4 border-[#f0f5f2] shadow-lg ${threshold === null ? "bg-[#63736b]" : (result.roas ?? 0) >= result.breakEven! ? "bg-[#1c7459]" : "bg-[#a56c33]"}`} style={{ left: `${current}%` }}/>}
    </div>
    <div className="mt-3 flex justify-between text-[10px] text-[#81968b]"><span>0x</span><span>{maximum.toLocaleString("tr-TR")}x</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-[#92a69b]">Başa baş</span><p className="mt-1 font-semibold text-[#efc183]">{ratio(result.breakEven)}</p></div><div className="text-right"><span className="text-[#92a69b]">Mevcut performans</span><p className="mt-1 font-semibold text-[#c9e5da]">{ratio(result.roas)}</p></div></div>
  </div>;
}

function ProfitSettingsModal({ store, categories, onClose, onSave }: Omit<Props, "transactions"> & { onClose: () => void }) {
  const saved = store.profitSettings;
  const [price, setPrice] = useState(String(saved?.averageSalePrice ?? ""));
  const [cost, setCost] = useState(String(saved?.averageUnitCost ?? ""));
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const roles = saved ?? suggestedProfitCategories(store.id, categories);
  const threshold = price && cost ? breakEvenRoas(Number(price), Number(cost)) : null;
  const close = () => { if (!lock.current) onClose(); };
  return <Modal open onClose={close} title={`${store.name} · Maliyet ve ROAS`} description="Kargo dahil ürün maliyetini, ortalama satış fiyatını ve reklam gideri kategorisini siz seçin. Ayarlar bu mağazaya kaydedilir.">
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault(); if (lock.current) return;
      const form = new FormData(event.currentTarget);
      const settings: ProfitSettings = { averageSalePrice: Number(price), averageUnitCost: Number(cost), advertisingCategoryIds: form.getAll("advertisingCategoryIds").map(String), productPurchaseCategoryIds: form.getAll("productPurchaseCategoryIds").map(String), salesCategoryIds: form.getAll("salesCategoryIds").map(String) };
      lock.current = true; setSubmitting(true);
      void onSave(settings).then((result) => { toast.success(result.persisted ? "Maliyet ve ROAS ayarları kaydedildi" : "Ayarlar demo oturumunda kaydedildi"); onClose(); }).catch((error) => toast.error(error instanceof Error ? error.message : "Ayarlar kaydedilemedi.")).finally(() => { lock.current = false; setSubmitting(false); });
    }}>
      <Field label={`Ortalama satış fiyatı (${store.currency})`}><input required disabled={submitting} type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input"/></Field>
      <Field label={`Kargo dahil ürün maliyeti (${store.currency})`}><input required disabled={submitting} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="input"/></Field>
      <div className="rounded-xl bg-[#17251f] p-3 text-xs leading-6 text-[#a6d7c3]">Planlanan başa baş ROAS: <strong>{ratio(threshold)}</strong><p className="text-[#93a59e]">{threshold === null && price && cost ? "Satış fiyatı, kargo dahil ürün maliyetinden yüksek olmalı." : "Satış fiyatı ÷ (satış fiyatı − kargo dahil ürün maliyeti)."}</p></div>
      <p className="text-xs leading-6 text-[#93a59e]">Maliyet payı = Sipariş gelirleri × (girdiğiniz kargo dahil ürün maliyeti ÷ ortalama satış fiyatı). Sipariş adedi ve ürün kayıtlarındaki fiyatlar kullanılmaz. Bu değerleri değiştirirseniz geçmiş dönem tahminleri de güncellenir.</p>
      <ProfitCategoryChoices field="advertisingCategoryIds" label="Reklam gideri kategorileri" hint="ROAS için hangi kategorinin giderlerinin kullanılacağını işaretleyin." type="expense" store={store} categories={categories} selected={roles.advertisingCategoryIds} disabled={submitting}/>
      <details className="rounded-xl border border-[#2d3933] p-3">
        <summary className="cursor-pointer text-xs font-medium text-[#bfcec5]">Diğer hesap ayarları</summary>
        <div className="mt-4 space-y-4">
          <ProfitCategoryChoices field="productPurchaseCategoryIds" label="Stok / ürün alımları" hint="Bu giderlerin yerine gelire göre maliyet payı kullanılır; iki kez düşülmez." type="expense" store={store} categories={categories} selected={roles.productPurchaseCategoryIds} disabled={submitting}/>
          <ProfitCategoryChoices field="salesCategoryIds" label="Satış geliri kategorileri" hint="Varsayılan kaynak Sipariş gelirleri kategorisidir. Yalnızca seçili gelir kategorileri hesaplanır." type="income" store={store} categories={categories} selected={roles.salesCategoryIds} disabled={submitting}/>
        </div>
      </details>
      <button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-xs font-bold text-[#07110f] disabled:opacity-50">{submitting ? "Kaydediliyor…" : "Kaydet ve hesapla"}</button>
    </form>
  </Modal>;
}

function ProfitCategoryChoices({ field, label, hint, type, store, categories, selected, disabled }: {
  field: "advertisingCategoryIds" | "productPurchaseCategoryIds" | "salesCategoryIds";
  label: string; hint: string; type: "income" | "expense"; store: Store; categories: Category[]; selected: string[]; disabled: boolean;
}) {
  const choices = categories.filter((category) => category.storeId === store.id && category.type === type);
  return <fieldset className="rounded-xl border border-[#2d3933] p-3">
    <legend className="px-1 text-xs font-semibold text-[#bfcec5]">{label}</legend>
    <p className="mb-2 text-[11px] leading-5 text-[#899b91]">{hint}</p>
    <div className="space-y-2">{choices.map((category) => <label key={category.id} className="flex items-center gap-2 text-xs text-[#c4cfc8]">
      <input disabled={disabled} type="checkbox" name={field} value={category.id} defaultChecked={selected.includes(category.id)} className="accent-[#2dd4bf]"/>{category.name}
    </label>)}{!choices.length && <p className="text-xs text-[#899b91]">Bu türde kategori yok. Kategoriler bölümünden ekleyebilirsiniz.</p>}</div>
  </fieldset>;
}

export function StoreProfitabilityTable({ stores, categories, transactions, onSelect }: Data & { stores: Store[]; onSelect: (id: string) => void }) {
  const results = useMemo(() => stores.map((store) => ({ store, result: calculateProfitability(store, categories, transactions) })), [stores, categories, transactions]);
  return <details className="group mb-5 rounded-2xl border border-[#293a33] bg-[#10181b]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-medium text-[#c4d7cb]">Tüm mağazaların kârlılığı <span className="flex items-center gap-2 text-xs text-[#8a9f92]">{stores.length} mağaza<ChevronDown size={15} className="transition group-open:rotate-180"/></span></summary>
    <div className="overflow-x-auto border-t border-[#26352d]"><table className="w-full min-w-[580px] text-left text-xs"><thead className="text-[#899f91]"><tr>{["Mağaza", "Satış geliri", "Reklam", "ROAS", "Tahmini kâr"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{results.map(({ store, result }) => <tr key={store.id} className="border-t border-[#25302a]"><td className="px-4 py-3"><button onClick={() => onSelect(store.id)} className="flex items-center gap-2 font-medium text-[#c1dfce] hover:text-white">{store.name}<ArrowUpRight size={12}/></button></td><td className="px-4 py-3">{reportMoney(result.revenue, store.currency)}</td><td className="px-4 py-3">{result.noAdvertisingCategory ? "Kategori seçilmedi" : reportMoney(result.adSpend, store.currency)}</td><td className="px-4 py-3">{ratio(result.roas)}</td><td className={`px-4 py-3 font-semibold ${result.profit === null ? "text-[#b6c3ba]" : result.profit >= 0 ? "text-[#79d5aa]" : "text-[#ef9c90]"}`}>{result.profit === null ? "Ayar gerekli" : reportMoney(result.profit, store.currency)}</td></tr>)}</tbody></table></div>
    <p className="px-4 py-3 text-[11px] leading-5 text-[#899f91]">Ana sayfada seçilen dönem kullanılır. Mağazalar kendi para birimleriyle gösterilir. Ayrıntılar ve maliyet ayarları için mağazaya tıklayın.</p>
  </details>;
}
