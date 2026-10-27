"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChartPie, ChevronDown, ReceiptText, Target } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { buildExpenseBreakdown } from "@/lib/expense-breakdown";
import { calculateProfitability } from "@/lib/profitability";
import { reportMoney } from "@/lib/store-analytics";
import type { Category, Store, Transaction } from "@/lib/types";
import { RoasGauge } from "./profitability-panel";

type Props = { store: Store; categories: Category[]; transactions: Transaction[]; onOpenRoas: () => void };
const ratio = (value: number | null) => value === null ? "—" : `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
const percent = (value: number) => `%${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

export function OverviewInsightCard({ store, categories, transactions, onOpenRoas }: Props) {
  const [view, setView] = useState<"expenses" | "roas">("expenses");
  const [showAll, setShowAll] = useState(false);
  const expenses = useMemo(() => buildExpenseBreakdown(store.id, categories, transactions), [store.id, categories, transactions]);
  const roas = useMemo(() => calculateProfitability(store, categories, transactions), [store, categories, transactions]);
  const amount = (value: number) => reportMoney(value, store.currency);
  const listed = showAll ? expenses.items : expenses.items.slice(0, 4);
  return <section aria-label="Gider dağılımı ve ROAS özeti" className="panel flex min-w-0 flex-col rounded-2xl p-4 md:p-5">
    <div role="group" aria-label="Özet kartı görünümü" className="grid grid-cols-2 gap-1 rounded-xl border border-[#2b363d] bg-[#0a1116] p-1">
      <button aria-pressed={view === "expenses"} onClick={() => setView("expenses")} className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition ${view === "expenses" ? "bg-[#29302c] text-[#f1c68e]" : "text-[#8b99a3] hover:text-white"}`}><ChartPie size={13}/>Gider dağılımı</button>
      <button aria-pressed={view === "roas"} onClick={() => setView("roas")} className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition ${view === "roas" ? "bg-[#19392d] text-[#93e1bd]" : "text-[#8b99a3] hover:text-white"}`}><Target size={13}/>ROAS</button>
    </div>
    {view === "expenses" ? <div aria-label="Gider dağılımı görünümü" className="flex flex-1 flex-col">
      <div className="mt-4 flex justify-between gap-2 text-[11px] text-[#8d9aa4]"><span>Seçili dönemin giderleri</span><span>{expenses.items.length} kategori · {expenses.count} kayıt</span></div>
      {expenses.total > 0 ? <>
        <div className="relative mx-auto mt-1 h-[174px] w-full max-w-[260px]">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={expenses.items} dataKey="value" nameKey="name" innerRadius={61} outerRadius={79} strokeWidth={0} paddingAngle={expenses.items.length > 1 ? 4 : 0}>{expenses.items.map((item) => <Cell key={item.id ?? "uncategorized"} fill={item.color}/>)}</Pie><Tooltip content={({ active, payload }) => {
            const item = payload?.[0]?.payload as (typeof expenses.items)[number] | undefined;
            return active && item ? <div className="rounded-xl border border-[#34424a] bg-[#101b22] p-3 text-xs shadow-xl"><p className="font-semibold text-[#e0e7eb]">{item.name}</p><p className="mt-1 text-[#c0cbd2]">{amount(item.value)} · {percent(item.share)}</p></div> : null;
          }}/></PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-14 text-center"><p className="text-[10px] text-[#8f9ca7]">Toplam gider</p><p className="mt-1 max-w-full break-words text-[17px] font-semibold leading-6 text-[#e8eef2]">{amount(expenses.total)}</p></div>
        </div>
        <div className={`${showAll ? "max-h-60 overflow-y-auto pr-1" : ""} space-y-3`}>
          {listed.map((item) => <div key={item.id ?? "uncategorized"}>
            <div className="mb-1.5 flex items-center gap-2 text-[11px]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }}/><span className="min-w-0 flex-1 truncate text-[#bdc8d0]" title={item.name}>{item.name}</span><span className="shrink-0 font-medium text-[#e0e7ec]">{amount(item.value)}</span><span className="w-10 shrink-0 text-right text-[#8c9ba6]">{percent(item.share)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#202a31]"><div className="h-full rounded-full" style={{ width: `${item.share}%`, backgroundColor: item.color }}/></div>
          </div>)}
        </div>
        {expenses.items.length > 4 && <button onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="mt-4 flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[#2d3942] px-3 text-[11px] font-medium text-[#a8bac7] hover:bg-white/[.03]">{showAll ? "Daha az göster" : `Tüm kategoriler (${expenses.items.length})`}<ChevronDown size={13} className={showAll ? "rotate-180" : ""}/></button>}
      </> : <div className="flex min-h-64 flex-1 flex-col items-center justify-center text-center"><ReceiptText size={29} className="text-[#586774]"/><p className="mt-3 text-sm font-medium text-[#bac6ce]">Bu dönemde gider yok</p><p className="mt-1 text-xs leading-5 text-[#7b8e9b]">Gider kaydettiğinizde kategori dağılımını burada görebilirsiniz.</p></div>}
    </div> : <div aria-label="Küçük ROAS görünümü" className="flex flex-1 flex-col">
      {roas.configured ? <>
        <div className="mt-5 flex items-start justify-between gap-2"><div><p className="text-[11px] text-[#91a69a]">Mevcut ROAS</p><p className="mt-1.5 text-[32px] font-semibold tracking-tight text-[#8ae0bb]">{ratio(roas.roas)}</p></div><span className={`mt-1 rounded-lg px-2 py-1 text-[10px] font-medium ${roas.profit !== null && roas.profit >= 0 ? "bg-[#18372a] text-[#8ed5ad]" : "bg-[#3a2920] text-[#efb383]"}`}>{roas.revenue === 0 ? "Henüz satış yok" : roas.profit !== null && roas.profit >= 0 ? "Kâr bölgesi" : "Zarar bölgesi"}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-[#343d30] bg-[#1c2118] p-3"><p className="text-[10px] text-[#a7b19c]">Başa baş ROAS</p><p className="mt-1.5 text-[17px] font-semibold text-[#e3be80]">{ratio(roas.breakEven)}</p></div><div className="rounded-xl border border-[#2a4034] bg-[#111f18] p-3"><p className="text-[10px] text-[#9eb4a5]">Ürün kârı</p><p className={`mt-1.5 break-words text-[15px] font-semibold ${roas.profit !== null && roas.profit < 0 ? "text-[#f5a092]" : "text-[#8bdaad]"}`}>{roas.profit === null ? "—" : amount(roas.profit)}</p></div></div>
        <RoasGauge result={roas} compact/>
        <p className="mt-3 text-[10px] leading-5 text-[#8ea495]">Sipariş geliri − kargo dahil maliyet payı − seçili reklam harcaması.</p>
        {(roas.noAdvertisingCategory || roas.noSalesCategory) && <p className="mt-2 text-[11px] leading-5 text-[#d9b47c]">Hesabı tamamlamak için gelir ve reklam kategorilerini kontrol edin.</p>}
      </> : <div className="flex min-h-64 flex-1 flex-col items-center justify-center px-2 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#18362a] text-[#9cdbb8]"><Target size={24}/></span><h3 className="mt-4 text-sm font-semibold text-[#d0dfd4]">ROAS hesabını başlatın</h3><p className="mt-2 text-xs leading-6 text-[#91a69a]">Bu mağaza için ortalama satış fiyatını, kargo dahil maliyeti ve reklam kategorisini seçin.</p></div>}
      <button onClick={onOpenRoas} aria-haspopup="dialog" className="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#3a6551] bg-[#173125] px-3 text-xs font-semibold text-[#a4e1be] hover:bg-[#204332]">{roas.configured ? "Ayrıntılı ROAS" : "ROAS ayarlarını aç"}<ArrowUpRight size={14}/></button>
    </div>}
  </section>;
}
