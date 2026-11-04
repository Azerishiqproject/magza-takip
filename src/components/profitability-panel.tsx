"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Settings2, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { calculateProfitability, suggestedProfitCategories, type Profitability } from "@/lib/profitability";
import { reportMoney } from "@/lib/store-analytics";
import type { Category, Order, Product, ProfitSettings, Store, Transaction } from "@/lib/types";
import { Modal } from "./modal";
import { LegacyCostResolver } from "./legacy-cost-resolver";

const ratio = (value: number | null) => value === null ? "—" : `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
type Data = { categories: Category[]; transactions: Transaction[]; orders: Order[]; products: Product[] };
type SettingsProps = { store: Store; categories: Category[]; onSave: (settings: ProfitSettings) => Promise<{ persisted: boolean }>; onDone: () => void };
type Props = Data & Omit<SettingsProps, "onDone"> & { stores: Store[]; periodTransactions: Transaction[]; onSelect: (id: string) => void; open: boolean; onOpenChange: (open: boolean) => void; onProducts: () => void; periodLabel: string };

export function ProfitabilityPanel({ store, stores, categories, transactions, orders, products, periodTransactions, onSelect, onSave, open, onOpenChange: setOpen, onProducts, periodLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const result = useMemo(() => calculateProfitability(store, categories, transactions, orders, products, stores), [store, stores, categories, transactions, orders, products]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setEditing(false); launcher.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, setOpen]);
  const close = () => { setOpen(false); setEditing(false); launcher.current?.focus(); };
  const amount = (value: number | null) => value === null ? "—" : reportMoney(value, store.currency);
  const setup = editing || !result.configured;
  return <>
    <div className="mb-5 flex items-center gap-3">
      <button ref={launcher} onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex min-h-11 items-center gap-2 rounded-xl border border-[#3b6657] bg-[#152820] px-4 text-xs font-semibold text-[#a3e4ca] hover:bg-[#1d372b]"><Target size={16}/>ROAS ve ürün kârı<ArrowUpRight size={14}/></button>
    </div>
    <Modal key={`${store.id}-${setup ? "settings" : "results"}`} open={open} size={setup ? "default" : "wide"} title={`${store.name} · ROAS ve ürün kârı`} description={`${periodLabel} · Ana sayfada seçili dönem`} onClose={close}>
      {setup ? <>
        {result.configured && <button onClick={() => setEditing(false)} className="mb-4 text-xs font-medium text-[#8bd4b2]">← Hesaba dön</button>}
        <ProfitSettingsForm key={store.id} store={store} categories={categories} onSave={onSave} onDone={() => setEditing(false)}/>
      </> : <section aria-label={`${store.name} ROAS sonuçları`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-[#91a69b]">Satılan ürünlerin alış fiyatları, sipariş kargosu, paket ve seçili reklam harcaması.</p><button onClick={() => setEditing(true)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#365044] px-3 py-2 text-xs text-[#b2d7c2]"><Settings2 size={13}/>Ayarlar</button></div>
        {!result.costComplete && <div className="mb-4 rounded-xl border border-[#715530] bg-[#292116] p-4 text-xs leading-6 text-[#edc78e]">
          <p className="font-semibold">Kâr hesabı için maliyet bilgilerini tamamlayın</p>
          {result.missingProducts.length > 0 && <p>Kontrol edilmesi gereken ürün/adet bilgileri: {result.missingProducts.join(", ")}.</p>}
          {result.missingShippingOrders > 0 && <p>{result.missingShippingOrders} siparişin kargo tutarı eksik.</p>}
          {result.unmatchedRecords > 0 && <p>{result.unmatchedRecords} gelir kaydı ({amount(result.unmatchedRevenue)}) için ürün/adet eşleştirmesi gerekiyor. Eski manuel satışları aşağıdan eşleştirebilirsiniz.</p>}
          <p>Eksik maliyetler sıfır sayılmaz. ROAS gösterilir; kâr ve başa baş eşiği bilgiler tamamlanınca hesaplanır.</p>
          <button onClick={() => { setEditing(false); onProducts(); }} className="mt-2 rounded-lg border border-[#82653f] px-3 py-2 font-semibold">Ürün alış fiyatlarını gir</button>
        </div>}
        <LegacyCostResolver stores={stores} store={store} products={products} issues={result.costReview} onSave={onSave}/>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[#2b4939] bg-[#12231c] p-4"><p className="flex items-center gap-2 text-xs text-[#a6b8af]"><TrendingUp size={14}/>Satılan ürünlerin kârı</p><p className={`mt-3 break-words text-3xl font-semibold tracking-tight ${result.profit !== null && result.profit < 0 ? "text-[#ff9b92]" : "text-[#6ce0b4]"}`}>{amount(result.profit)}</p><p className="mt-2 text-xs leading-5 text-[#93a59e]">Gelir − alış maliyeti − kargo − paket − reklam</p></div>
          <div className="rounded-xl border border-[#27372f] bg-[#0e1714] p-4"><p className="text-xs text-[#a6b8af]">Mevcut ROAS</p><p className="mt-3 text-3xl font-semibold text-[#8ce1d0]">{ratio(result.roas)}</p><p className="mt-2 text-xs leading-5 text-[#93a59e]">{result.noAdvertisingCategory ? "Reklam gideri kategorisini seçin." : result.roas === null ? "Bu dönemde seçili reklam kategorisinde gider yok." : `1 ${store.currency} reklam → ${result.roas.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${store.currency} satış geliri`}</p></div>
          <div className="rounded-xl border border-[#27372f] bg-[#0e1714] p-4"><p className="text-xs text-[#a6b8af]">Başa baş ROAS</p><p className="mt-3 text-3xl font-semibold text-[#edc488]">{ratio(result.breakEven)}</p><p className="mt-2 text-xs leading-5 text-[#93a59e]">{!result.costComplete ? "Ürün maliyetleri tamamlanmalı." : result.noContribution ? "Alış maliyeti, kargo ve paket satış gelirini karşılamıyor." : result.revenue === 0 ? "Bu dönemde sipariş geliri yok." : "Satılan ürünlerin gerçek maliyetiyle hesaplanan eşik."}</p></div>
        </div>
        <RoasGauge result={result}/>
        {(result.noSalesCategory || result.noAdvertisingCategory) && <p className="mt-4 rounded-xl bg-[#282217] p-3 text-xs leading-6 text-[#dfc18b]">{result.noSalesCategory ? "Satış geliri kategorisini seçin. " : ""}{result.noAdvertisingCategory ? "Reklam gideri kategorisini seçin." : ""}</p>}
        <dl className="mt-4 grid gap-3 rounded-xl border border-[#293a31] bg-[#101b16] p-4 text-xs sm:grid-cols-2 md:grid-cols-5">
          {[["Sipariş geliri", amount(result.revenue)], ["Satılan ürünlerin alış maliyeti", amount(result.purchaseCost)], ["Sipariş kargosu", amount(result.shippingCost)], ["Paket gideri", amount(result.packagingCost)], ["Seçili reklam harcaması", amount(result.adSpend)]].map(([label, value]) => <div key={label}><dt className="text-[#8eaa99]">{label}</dt><dd className="mt-2 text-sm font-semibold text-[#d5e1da]">{value}</dd></div>)}
        </dl>
        <p className="mt-3 text-[11px] leading-5 text-[#8eaa99]">{result.linkedOrderCount} tamamlanan sipariş{result.manualIncomeCount > 0 ? ` · ${result.manualIncomeCount} manuel satış kaydı` : ""}{result.soldUnits === null ? "" : ` · ${result.soldUnits} satılan ürün`}. Alış maliyeti, her ürünün alış fiyatı × adedidir. {store.currency === "AZN" ? "Gönderilen her pakete, ürün sayısından bağımsız 4 ₼ kargo ve 1 ₼ paket gideri eklenir." : "Kargo için siparişte kayıtlı tutar kullanılır."} Diğer giderler bu hesaba katılmaz.</p>
        {result.legacyResolvedCount > 0 && <p className="mt-2 text-[11px] leading-5 text-[#8eaa99]">{result.legacyResolvedCount} eski kayıt, açık adet bilgisi ve stok alış fiyatları veya kaydettiğiniz eşleştirmelerle hesaplandı. Eski ürün bağlantısı olmayan kayıtlarda mağazadaki tüm ürünlerin alış fiyatı aynıysa ortak fiyat kullanılır.</p>}
        {result.excludedRecords > 0 && <p className="mt-2 text-[11px] leading-5 text-[#8eaa99]">{result.excludedRecords} kayıt ({amount(result.excludedRevenue)}) tercihinizle ROAS dışında tutuluyor. Gelir-gider kayıtları korunur.</p>}
        <OrderProfitabilityTable result={result} store={store}/>
        <StoreProfitabilityTable orders={orders} products={products} stores={stores} categories={categories} transactions={periodTransactions} onSelect={(id) => { setEditing(false); onSelect(id); }}/>
      </section>}
    </Modal>
  </>;
}

export function RoasGauge({ result, compact = false }: { result: Profitability; compact?: boolean }) {
  const maximum = Math.max(6, Math.ceil(Math.max(result.roas ?? 0, result.breakEven ?? 0) * 1.25));
  const threshold = result.breakEven === null ? null : result.breakEven / maximum * 100;
  const current = result.roas === null ? null : Math.max(1, Math.min(99, result.roas / maximum * 100));
  if (compact) return <div role="img" aria-label={`ROAS göstergesi. Başa baş ${ratio(result.breakEven)}, mevcut ${ratio(result.roas)}.`} className="mt-4 rounded-xl border border-[#2b4035] bg-[#0b1510] p-3">
    <div className="relative mx-1 mt-2 h-2.5 rounded-full bg-[#33413c]" style={threshold === null ? undefined : { background: `linear-gradient(to right, #bd8d4d 0%, #bd8d4d ${threshold}%, #3e9277 ${threshold}%, #3e9277 100%)` }}>
      {threshold !== null && <span className="absolute -top-1.5 h-6 w-0.5 bg-[#efbd6f]" style={{ left: `${threshold}%` }}/>}
      {current !== null && <span className={`absolute -top-1 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-[#f0f5f2] ${threshold === null ? "bg-[#63736b]" : result.roas! >= result.breakEven! ? "bg-[#1c7459]" : "bg-[#a56c33]"}`} style={{ left: `${current}%` }}/>}
    </div>
    <div className="mt-3 flex justify-between gap-2 text-[10px] text-[#9eb4a6]"><span>0x</span><span className="text-[#dcb77d]">Eşik {ratio(result.breakEven)}</span><span>{maximum.toLocaleString("tr-TR")}x</span></div>
  </div>;
  return <div className="mt-5 rounded-xl border border-[#293a31] bg-[#0b1410] p-4" role="img" aria-label={`ROAS göstergesi. Başa baş ${ratio(result.breakEven)}, mevcut ${ratio(result.roas)}.`}>
    <div className="mb-6 flex flex-wrap justify-between gap-2 text-xs text-[#a7b7af]"><span>ROAS performansı</span><span className={result.profit !== null && result.profit >= 0 ? "text-[#7cdbb4]" : "text-[#efc183]"}>{result.profit === null ? "Maliyet veya reklam seçimi bekleniyor" : result.revenue === 0 ? "Henüz satış yok" : result.profit > 0 ? "Kâr bölgesinde" : result.profit === 0 ? "Başa baş" : "Zarar bölgesinde"}</span></div>
    <div className="relative mx-1 h-4 rounded-full bg-[#33413c]" style={threshold === null ? undefined : { background: `linear-gradient(to right, #bd8d4d 0%, #bd8d4d ${threshold}%, #3e9277 ${threshold}%, #3e9277 100%)` }}>
      {threshold !== null && <span className="absolute -top-2 h-8 w-0.5 bg-[#efbd6f]" style={{ left: `${threshold}%` }}/>}
      {current !== null && <span className={`absolute -top-1.5 h-7 w-7 -translate-x-1/2 rounded-full border-4 border-[#f0f5f2] shadow-lg ${threshold === null ? "bg-[#63736b]" : (result.roas ?? 0) >= result.breakEven! ? "bg-[#1c7459]" : "bg-[#a56c33]"}`} style={{ left: `${current}%` }}/>}
    </div>
    <div className="mt-3 flex justify-between text-[10px] text-[#81968b]"><span>0x</span><span>{maximum.toLocaleString("tr-TR")}x</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-[#92a69b]">Başa baş</span><p className="mt-1 font-semibold text-[#efc183]">{ratio(result.breakEven)}</p></div><div className="text-right"><span className="text-[#92a69b]">Mevcut performans</span><p className="mt-1 font-semibold text-[#c9e5da]">{ratio(result.roas)}</p></div></div>
  </div>;
}

function ProfitSettingsForm({ store, categories, onSave, onDone }: SettingsProps) {
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const roles = store.profitSettings ?? suggestedProfitCategories(store.id, categories);
  return <form className="space-y-4" onSubmit={(event) => {
    event.preventDefault(); if (lock.current) return;
    const form = new FormData(event.currentTarget);
    const settings: ProfitSettings = { ...(store.profitSettings?.costMappings ? { costMappings: store.profitSettings.costMappings } : {}), advertisingCategoryIds: form.getAll("advertisingCategoryIds").map(String), salesCategoryIds: form.getAll("salesCategoryIds").map(String) };
    lock.current = true; setSubmitting(true);
    void onSave(settings).then((result) => { toast.success(result.persisted ? "ROAS ayarları kaydedildi" : "ROAS ayarları demo oturumunda kaydedildi"); onDone(); }).catch((error) => toast.error(error instanceof Error ? error.message : "Ayarlar kaydedilemedi.")).finally(() => { lock.current = false; setSubmitting(false); });
  }}>
    <div className="rounded-xl bg-[#17251f] p-3 text-xs leading-6 text-[#a6d7c3]">Alış fiyatlarını Ürünler ve stok bölümünde girin. Başa baş ROAS, her siparişin ürünleri, kargosu ve paketi üzerinden otomatik hesaplanır. Ortalama satış fiyatı veya maliyet girmeniz gerekmez.</div>
    <ProfitCategoryChoices field="advertisingCategoryIds" label="Reklam gideri kategorileri" hint="Reklam harcaması olarak kullanılacak kategorileri seçin." type="expense" store={store} categories={categories} selected={roles.advertisingCategoryIds} disabled={submitting}/>
    <details className="rounded-xl border border-[#2d3933] p-3"><summary className="cursor-pointer text-xs font-medium text-[#bfcec5]">Satış geliri kaynağı</summary><div className="mt-3"><ProfitCategoryChoices field="salesCategoryIds" label="Satış geliri kategorileri" hint="Siparişe bağlı gelirlerin bulunduğu kategorileri seçin. Varsayılan: Sipariş gelirleri." type="income" store={store} categories={categories} selected={roles.salesCategoryIds} disabled={submitting}/></div></details>
    <button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-xs font-bold text-[#07110f] disabled:opacity-50">{submitting ? "Kaydediliyor…" : "Kaydet ve hesapla"}</button>
  </form>;
}

function ProfitCategoryChoices({ field, label, hint, type, store, categories, selected, disabled }: {
  field: "advertisingCategoryIds" | "salesCategoryIds";
  label: string; hint: string; type: "income" | "expense"; store: Store; categories: Category[]; selected: string[]; disabled: boolean;
}) {
  const choices = categories.filter((category) => category.storeId === store.id && category.type === type);
  return <fieldset className="rounded-xl border border-[#2d3933] p-3">
    <legend className="px-1 text-xs font-semibold text-[#bfcec5]">{label}</legend><p className="mb-2 text-[11px] leading-5 text-[#899b91]">{hint}</p>
    <div className="space-y-2">{choices.map((category) => <label key={category.id} className="flex items-center gap-2 text-xs text-[#c4cfc8]"><input disabled={disabled} type="checkbox" name={field} value={category.id} defaultChecked={selected.includes(category.id)} className="accent-[#2dd4bf]"/>{category.name}</label>)}{!choices.length && <p className="text-xs text-[#899b91]">Bu türde kategori yok. Kategoriler bölümünden ekleyebilirsiniz.</p>}</div>
  </fieldset>;
}

function OrderProfitabilityTable({ result, store }: { result: Profitability; store: Store }) {
  if (!result.orderResults.length) return null;
  const amount = (value: number | null) => value === null ? "Eksik" : reportMoney(value, store.currency);
  return <details className="group mt-4 rounded-xl border border-[#293a33] bg-[#10181b]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-xs font-medium text-[#c4d7cb]">Sipariş bazında maliyet ve başa baş ROAS <ChevronDown size={14}/></summary>
    <p className="px-4 pb-3 text-[11px] leading-5 text-[#899f91]">Reklam harcaması dönem toplamından düşülür. Aşağıdaki katkı, reklam öncesi tutardır.</p>
    <div className="max-h-80 overflow-auto border-t border-[#26352d]"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[#899f91]"><tr>{["Sipariş / manuel satış", "Gelir", "Alış maliyeti", "Kargo", "Paket", "Reklam öncesi katkı", "Başa baş ROAS"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{result.orderResults.map((o) => <tr key={o.sourceKey} className="border-t border-[#25302a]"><td className="px-4 py-3"><p className="font-medium text-[#c1dfce]">{o.customerName}</p><p className="mt-1 text-[10px] text-[#899f91]">{o.date} · {o.units ?? "?"} ürün · {o.packageCount} paket</p></td><td className="px-4 py-3">{amount(o.revenue)}</td><td className="px-4 py-3">{amount(o.purchaseCost)}</td><td className="px-4 py-3">{amount(o.shippingCost)}</td><td className="px-4 py-3">{amount(o.packagingCost)}</td><td className="px-4 py-3">{amount(o.contribution)}</td><td className="px-4 py-3 font-semibold text-[#edc488]">{ratio(o.breakEven)}</td></tr>)}</tbody></table></div>
  </details>;
}

function StoreProfitabilityTable({ stores, categories, transactions, orders, products, onSelect }: Data & { stores: Store[]; onSelect: (id: string) => void }) {
  const results = useMemo(() => stores.map((store) => ({ store, result: calculateProfitability(store, categories, transactions, orders, products, stores) })), [stores, categories, transactions, orders, products]);
  return <details className="group mt-4 rounded-xl border border-[#293a33] bg-[#10181b]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-xs font-medium text-[#c4d7cb]">Tüm mağazaların ROAS ve ürün kârı <ChevronDown size={14} className="transition group-open:rotate-180"/></summary>
    <div className="overflow-x-auto border-t border-[#26352d]"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-[#899f91]"><tr>{["Mağaza", "ROAS", "Satılan ürünlerin kârı"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{results.map(({ store, result }) => <tr key={store.id} className="border-t border-[#25302a]"><td className="px-4 py-3"><button onClick={() => onSelect(store.id)} className="flex items-center gap-2 font-medium text-[#c1dfce] hover:text-white">{store.name}<ArrowUpRight size={12}/></button></td><td className="px-4 py-3">{ratio(result.roas)}</td><td className={`px-4 py-3 font-semibold ${result.profit === null ? "text-[#b6c3ba]" : result.profit >= 0 ? "text-[#79d5aa]" : "text-[#ef9c90]"}`}>{result.profit === null ? "Eksik bilgi" : reportMoney(result.profit, store.currency)}</td></tr>)}</tbody></table></div>
  </details>;
}
