"use client";

import { useId, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SlidersHorizontal, Store as StoreIcon } from "lucide-react";
import { buildSalesReport, buildStoreReports, getReportRange, matchesSalesStatus, orderCreatedDate, reportCategoryOptions, reportMoney, scopedReportStores, type CurrencyReport, type ReportMetric, type ReportPeriod, type ReportView, type SalesStatus, type StatusScope } from "@/lib/store-analytics";
import type { Category, Order, Store, StoreFolder, Transaction } from "@/lib/types";
import { ReportStoreSelect } from "./report-store-select";
import { ReportDetails } from "./report-details";
import { StoreSalesReport } from "./store-sales-report";
import { Field } from "./modal";

const METRICS: { id: ReportMetric; label: string }[] = [{ id: "all", label: "Finans özeti" }, { id: "sales", label: "Satış adedi" }, { id: "income", label: "Gelir" }, { id: "expense", label: "Gider" }, { id: "profit", label: "Kâr / zarar" }];
const VIEWS: { id: ReportView; label: string }[] = [{ id: "time", label: "Zaman" }, { id: "stores", label: "Mağazalar" }, { id: "folders", label: "Klasörler" }, { id: "categories", label: "Kategoriler" }];
const SERIES = [{ key: "income", label: "Gelir", color: "#2dd4bf" }, { key: "expense", label: "Gider", color: "#ff887d" }, { key: "profit", label: "Kâr / zarar", color: "#57b8ff" }] as const;

export function StoresAnalytics({ stores, folders, categories, transactions, orders, visible = true }: { visible?: boolean; orders: Order[]; stores: Store[]; folders: StoreFolder[]; categories: Category[]; transactions: Transaction[] }) {
  const [status, setStatus] = useState<StatusScope>("all");
  const [included, setIncluded] = useState<string[] | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [currency, setCurrency] = useState<Store["currency"]>(stores[0]?.currency ?? "AZN");
  const [category, setCategory] = useState("all");
  const [metric, setMetric] = useState<ReportMetric>("sales");
  const [view, setView] = useState<ReportView>("time");
  const [salesStatus, setSalesStatus] = useState<SalesStatus>("valid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const isSales = metric === "sales";
  const scoped = useMemo(() => scopedReportStores(stores, folders, "all", status), [stores, folders, status]);
  const selected = useMemo(() => scoped.filter((store) => included === null || included.includes(store.id)), [scoped, included]);
  const categoryOptions = useMemo(() => reportCategoryOptions(stores, categories, transactions), [stores, categories, transactions]);
  const selectedIds = useMemo(() => new Set(selected.map((store) => store.id)), [selected]);
  const range = useMemo(() => getReportRange(period, customStart, customEnd, isSales ? orders.filter((item) => selectedIds.has(item.storeId) && matchesSalesStatus(item, salesStatus)).map((item) => ({ date: orderCreatedDate(item) ?? "" })) : transactions.filter((item) => selectedIds.has(item.storeId))), [period, customStart, customEnd, transactions, selectedIds, isSales, orders, salesStatus]);
  const reports = useMemo(() => isSales ? [] : buildStoreReports(selected, categories, transactions, range, category, folders), [selected, categories, transactions, range, category, folders, isSales]);
  const salesReport = useMemo(() => isSales ? buildSalesReport(selected, folders, orders, range, salesStatus) : null, [isSales, selected, folders, orders, range, salesStatus]);
  const report = reports.find((item) => item.currency === currency) ?? reports[0];
  const selectedCategory = categoryOptions.find((item) => item.key === category);
  const includedIds = stores.filter((store) => included === null || included.includes(store.id)).map((store) => store.id);

  // Keep selections mounted while avoiding chart measurements in the hidden management view.
  if (!visible) return null;

  const activeFilters = [
    status !== "all" ? status === "active" ? "Aktif mağazalar" : "Duraklatılmış mağazalar" : null,
    isSales ? salesStatus !== "valid" ? ({ all: "İptaller dahil", active: "Devam eden siparişler", completed: "Teslim edilen siparişler", cancelled: "İptal edilen siparişler" } as const)[salesStatus] : null : category !== "all" ? selectedCategory?.name ?? "Silinmiş kategori" : null,
  ].filter(Boolean);
  const resetFilters = () => { setStatus("all"); setCategory("all"); setSalesStatus("valid"); };

  return <section aria-label="Mağazalar finans raporu" className="panel rounded-2xl p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-semibold">{isSales ? "Satış özeti" : "Finans özeti"}</h3><p className="mt-1 text-xs leading-5 text-[#929da8]">{isSales ? "Her gün kaç sipariş geldiğini takip edin." : "Mağazalarınızın gelir, gider ve kârını birlikte inceleyin."}</p></div>
      <button type="button" aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen(!filtersOpen)} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${filtersOpen || activeFilters.length ? "border-[#3b7469] bg-[#152721] text-[#79dfd2]" : "border-[#303a44] text-[#a9b4be] hover:bg-white/5"}`}><SlidersHorizontal size={15}/>Filtreler{activeFilters.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-md bg-[#2c5148] px-1 text-[11px]">{activeFilters.length}</span>}</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <ReportStoreSelect stores={stores} folders={folders} selectedIds={includedIds} onChange={(ids) => setIncluded(ids.length === stores.length ? null : ids)}/>
      <Field label="Dönem"><select aria-label="Rapor dönemi" className="input" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}><option value="day">Bugün</option><option value="week">Bu hafta</option><option value="month">Bu ay</option><option value="year">Bu yıl</option><option value="all">Tüm zamanlar</option><option value="custom">Özel tarih aralığı</option></select></Field>
      <Field label="Göster"><select aria-label="Grafik metriği" className="input" value={metric} onChange={(event) => { const next = event.target.value as ReportMetric; setMetric(next); if (next === "sales" && view === "categories") setView("time"); }}>{METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    </div>
    {period === "custom" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Başlangıç"><input aria-label="Rapor başlangıç tarihi" className="input" type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)}/></Field><Field label="Bitiş"><input aria-label="Rapor bitiş tarihi" className="input" type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)}/></Field></div>}
    <div id={filtersId} hidden={!filtersOpen} className="mt-4 rounded-xl border border-[#29333c] bg-[#0c1116] p-4">
      <div className="mb-4 flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Ek filtreler</h4><button type="button" onClick={resetFilters} className="min-h-9 rounded-lg px-2 text-xs text-[#79dfd2] hover:bg-white/5">Sıfırla</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mağaza durumu"><select aria-label="Rapor mağaza durumu" className="input" value={status} onChange={(event) => setStatus(event.target.value as StatusScope)}><option value="all">Tüm mağaza durumları</option><option value="active">Yalnızca aktif</option><option value="paused">Yalnızca duraklatılmış</option></select></Field>
        {isSales ? <Field label="Sipariş durumu"><select aria-label="Satış adedi sipariş durumu" className="input" value={salesStatus} onChange={(event) => setSalesStatus(event.target.value as SalesStatus)}><option value="valid">İptaller hariç</option><option value="all">İptaller dahil tümü</option><option value="active">Devam eden siparişler</option><option value="completed">Teslim edilen siparişler</option><option value="cancelled">İptal edilen siparişler</option></select></Field> : <Field label="Kategori"><select aria-label="Rapor kategorisi" className="input" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Tüm kategoriler</option>{(["income", "expense"] as const).map((type) => <optgroup key={type} label={type === "income" ? "Gelir kategorileri" : "Gider kategorileri"}>{categoryOptions.filter((item) => item.type === type).map((item) => <option key={item.key} value={item.key}>{item.name} · {type === "income" ? "Gelir" : "Gider"}</option>)}</optgroup>)}{category !== "all" && !selectedCategory && <option value={category}>Seçili kategori artık yok</option>}</select></Field>}
      </div>
    </div>
    {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Etkin rapor filtreleri">{activeFilters.map((label) => <span key={label} className="rounded-lg bg-[#1b2927] px-2.5 py-1.5 text-[11px] text-[#a5c9bd]">{label}</span>)}<button type="button" onClick={resetFilters} className="min-h-9 px-2 text-xs text-[#a2aeb9] underline underline-offset-4">Sıfırla</button></div>}
    {range.error ? <p role="alert" className="mt-4 rounded-xl border border-[#63332f] bg-[#271817] p-3 text-xs text-[#ff887d]">{range.error}</p> : !selected.length ? <div className="py-14 text-center"><StoreIcon size={28} className="mx-auto text-[#71818d]"/><p className="mt-3 text-sm text-[#c0cbd4]">Rapor için en az bir mağaza seçin.</p><button type="button" onClick={() => { resetFilters(); setIncluded(null); }} className="mt-3 rounded-lg border border-[#31564e] px-4 py-2.5 text-xs text-[#79dfd2]">Mağazaları yeniden seç</button></div> : <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#27313a] pt-4">
        <p className="text-xs text-[#929da8]">{isSales ? selected.length : report?.storeCount ?? 0} mağaza · {range.start.split("-").reverse().join(".")} — {range.end.split("-").reverse().join(".")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {!isSales && reports.length > 1 && <select aria-label="Rapor para birimi" value={report?.currency ?? ""} onChange={(event) => setCurrency(event.target.value as Store["currency"])} className="input !w-auto !py-2">{reports.map((item) => <option key={item.currency} value={item.currency}>{item.currency}</option>)}</select>}
          <select aria-label="Grafik kırılımı" className="input !w-auto !py-2 text-xs" value={view} onChange={(event) => setView(event.target.value as ReportView)}>{VIEWS.filter((item) => !isSales || item.id !== "categories").map((item) => <option key={item.id} value={item.id}>{item.id === "time" ? "Zamana göre" : item.id === "stores" ? "Mağazalara göre" : item.id === "folders" ? "Klasörlere göre" : "Kategorilere göre"}</option>)}</select>
        </div>
      </div>
      {salesReport && <StoreSalesReport report={salesReport} view={view === "categories" ? "time" : view}/>}
      {!isSales && report && <>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ReportMetricCard label="Gelir" value={reportMoney(report.income, report.currency)} color="#68ddcd"/>
          <ReportMetricCard label="Gider" value={reportMoney(report.expense, report.currency)} color="#ff9b92"/>
          <ReportMetricCard label={category === "all" ? "Kâr / zarar" : "Kategori net sonucu"} value={reportMoney(report.profit, report.currency)} color={report.profit < 0 ? "#ff9b92" : "#83c8fa"}/>
        </div>
        <div className="mt-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{view === "time" ? metric === "all" ? "Gelir, gider ve kâr" : `${METRICS.find((item) => item.id === metric)?.label} akışı` : view === "stores" ? "Mağaza karşılaştırması" : view === "folders" ? "Klasör karşılaştırması" : "Kategori karşılaştırması"}</h4><span className="text-xs text-[#929da8]">{report.currency}{view === "time" ? ` · ${report.granularity === "year" ? "Yıllık" : report.granularity === "month" ? "Aylık" : "Günlük"}` : ""}</span></div>
          {report.count ? <ReportChart report={report} metric={metric} view={view}/> : <div className="grid min-h-[240px] place-items-center text-center text-sm text-[#929da8]">Bu seçim için finans kaydı bulunmuyor.</div>}
        </div>
        <ReportDetails>
          <p className="mb-4 text-xs leading-6 text-[#929da8]">Teslim edilen siparişler ve kaydedilmiş gelir/giderler gösterilir. Para birimleri ayrı hesaplanır. Kategori seçildiğinde özet ve grafik yalnızca o kategoriye aittir.</p>
          <ReportTable report={report} view={view}/>
        </ReportDetails>
      </>}
    </>}
  </section>;
}

function ReportMetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="rounded-xl bg-[#ffffff03] p-4"><p className="text-xs text-[#9ca8b4]">{label}</p><p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl" style={{ color }}>{value}</p></div>;
}

function ReportChart({ report, metric, view }: { report: CurrencyReport; metric: ReportMetric; view: ReportView }) {
  const series = SERIES.filter((item) => metric === "all" || item.key === metric);
  const data = view === "time" ? report.timeline : view === "stores" ? report.byStore : view === "folders" ? report.byFolder : report.byCategory.map((point) => ({ ...point, label: `${point.label} · ${point.type === "income" ? "Gelir" : "Gider"}` }));
  const chartHeight = view === "time" ? 290 : Math.max(290, data.length * 55);
  const shared = <><CartesianGrid stroke="#252d35" strokeDasharray="3 5" vertical={false}/><ReferenceLine y={view === "time" ? 0 : undefined} x={view !== "time" ? 0 : undefined} stroke="#45515c"/><Tooltip contentStyle={{ background: "#111820", border: "1px solid #2c3740", borderRadius: 12, fontSize: 11 }} labelStyle={{ color: "#c6d1d9" }} formatter={(value, name) => [reportMoney(Number(value), report.currency), name]} cursor={view === "time" ? { stroke: "#42535c" } : { fill: "#ffffff06" }}/><Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }}/></>;
  return <div className="max-h-[540px] overflow-y-auto" data-testid="stores-report-chart" aria-label={`${view === "time" ? "Zaman" : view === "stores" ? "Mağaza" : view === "folders" ? "Klasör" : "Kategori"} grafiği, ${METRICS.find((item) => item.id === metric)?.label}, ${report.currency}`}><div style={{ height: chartHeight, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%">{view === "time" ? <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>{shared}<XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={25} tick={{ fill: "#929da8", fontSize: 11 }}/><YAxis width={55} axisLine={false} tickLine={false} tick={{ fill: "#929da8", fontSize: 11 }} tickFormatter={(value) => Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))}/>{series.map((item) => <Line key={item.key} type="linear" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false}/>)}</LineChart> : <BarChart data={data} layout="vertical" margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>{shared}<XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#929da8", fontSize: 11 }} tickFormatter={(value) => Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))}/><YAxis type="category" dataKey="label" width={105} axisLine={false} tickLine={false} tick={{ fill: "#a0aab3", fontSize: 11 }} tickFormatter={(value) => String(value).length > 20 ? `${String(value).slice(0, 19)}…` : String(value)}/>{series.map((item) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false}>{item.key === "profit" && data.map((point) => <Cell key={point.id} fill={point.profit < 0 ? "#ff887d" : "#57b8ff"}/>)}</Bar>)}</BarChart>}</ResponsiveContainer></div></div>;
}

function ReportTable({ report, view }: { report: CurrencyReport; view: ReportView }) {
  const categoryView = view === "categories";
  const folderView = view === "folders";
  const rows = categoryView ? report.byCategory : folderView ? report.byFolder : report.byStore;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[580px] text-left"><caption className="pb-3 text-left text-xs font-semibold">{categoryView ? "Kategori toplamları" : folderView ? "Klasör toplamları" : "Mağaza toplamları"} · {report.currency}</caption><thead><tr className="border-b border-[#29333c] text-[11px] text-[#78838d]"><th className="pb-2 font-medium">{categoryView ? "Kategori" : folderView ? "Klasör" : "Mağaza"}</th><th className="pb-2 text-right font-medium">Satış / gelir</th><th className="pb-2 text-right font-medium">Gider</th><th className="pb-2 text-right font-medium">Net sonuç</th><th className="pb-2 text-right font-medium">İşlem</th></tr></thead><tbody>{rows.map((point) => <tr key={point.id} className="border-b border-[#20272e] text-xs last:border-0"><td className="py-3 pr-3"><span className="block max-w-[220px] break-words">{point.label}</span>{"storeCount" in point && <span className="mt-0.5 block text-[11px] text-[#78838d]">{String(point.storeCount)} mağaza</span>}{"type" in point && <span className="mt-0.5 block text-[11px] text-[#78838d]">{point.type === "income" ? "Gelir kategorisi" : "Gider kategorisi"}</span>}</td><td className="py-3 text-right text-[#68ddcd]">{reportMoney(point.income, report.currency)}</td><td className="py-3 text-right text-[#ff887d]">{reportMoney(point.expense, report.currency)}</td><td className={`py-3 text-right font-semibold ${point.profit < 0 ? "text-[#ff887d]" : "text-[#69bdf9]"}`}>{reportMoney(point.profit, report.currency)}</td><td className="py-3 text-right text-[#89939f]">{point.count}</td></tr>)}</tbody><tfoot><tr className="border-t border-[#3c4c52] text-xs font-semibold"><th className="pt-3">Toplam</th><td className="pt-3 text-right text-[#68ddcd]">{reportMoney(report.income, report.currency)}</td><td className="pt-3 text-right text-[#ff887d]">{reportMoney(report.expense, report.currency)}</td><td className={`pt-3 text-right ${report.profit < 0 ? "text-[#ff887d]" : "text-[#69bdf9]"}`}>{reportMoney(report.profit, report.currency)}</td><td className="pt-3 text-right text-[#89939f]">{report.count}</td></tr></tfoot></table></div>;
}
