"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { eachDayOfInterval, endOfDay, format, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays } from "date-fns";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Download, Layers3, Pencil, Plus, Search, TrendingUp, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { useFinanceData } from "@/hooks/use-finance-data";
import { money, shortDate } from "@/lib/format";
import type { Category, Period, Store, StoreFolder, Transaction, TransactionType } from "@/lib/types";
import { Field, Modal } from "./modal";
import { MobileMenuButton, Sidebar, type View } from "./sidebar";
import { ProductsView } from "./products-view";
import { OrdersView } from "./orders-view";
import { StoresView } from "./stores-view";
import { StorePicker } from "./store-picker";
import { ProfitabilityPanel, StoreProfitabilityTable } from "./profitability-panel";

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Bugün" }, { id: "week", label: "Hafta" }, { id: "month", label: "Ay" }, { id: "year", label: "Yıl" }, { id: "custom", label: "Özel" },
];

const expenseColors = ["#ff7468", "#f4b860", "#57b8ff", "#87929d", "#2dd4bf"];
const monthLabels = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

type ChartGranularity = "day" | "month";
type ChartPoint = { date: string; label: string; gelir: number; gider: number; granularity: ChartGranularity };

function getRange(period: Period, customStart: string, customEnd: string) {
  const now = new Date();
  if (period === "day") return [startOfDay(now), endOfDay(now)];
  if (period === "week") return [startOfWeek(now, { weekStartsOn: 1 }), endOfDay(now)];
  if (period === "year") return [startOfYear(now), endOfDay(now)];
  if (period === "custom" && customStart && customEnd) return [startOfDay(new Date(`${customStart}T12:00:00`)), endOfDay(new Date(`${customEnd}T12:00:00`))];
  return [startOfMonth(now), endOfDay(now)];
}

export function Dashboard() {
  const { stores, folders, products, addProduct, updateProduct, adjustStock, categories, transactions, orders, isDemo, addStore, updateStore, deleteStore, saveFolder, deleteFolder, updateOrder, deleteOrder, addCategory, updateCategory, addTransaction, updateTransaction, addOrder, updateOrderStage, editOrderDetails, completeOrder, cancelOrder } = useFinanceData();
  const [view, setView] = useState<View>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeStoreId, setActiveStoreId] = useState(stores[0]?.id ?? "");
  const [period, setPeriod] = useState<Period>("month");
  const [customStart, setCustomStart] = useState(subDays(new Date(), 30).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10));
  const [storePicker, setStorePicker] = useState(false);
  const [modal, setModal] = useState<"transaction" | "store" | "category" | null>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>("income");
  const [chartDetail, setChartDetail] = useState<{ date: string; type: TransactionType; granularity: ChartGranularity } | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const activeStore = stores.find((store) => store.id === activeStoreId) ?? stores[0];

  const periodTransactions = useMemo(() => {
    const [rangeStart, rangeEnd] = getRange(period, customStart, customEnd);
    return [...new Map(transactions.filter((item) => {
      const date = new Date(`${item.date}T12:00:00`);
      return date >= rangeStart && date <= rangeEnd;
    }).map((item) => [item.id, item])).values()];
  }, [transactions, period, customStart, customEnd]);
  const storeTransactions = useMemo(() => periodTransactions.filter((item) => item.storeId === activeStore?.id), [periodTransactions, activeStore?.id]);
  const storeCategories = categories.filter((category) => category.storeId === activeStore?.id);

  const totalIncome = storeTransactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = storeTransactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const profit = totalIncome - totalExpense;
  const margin = totalIncome ? (profit / totalIncome) * 100 : 0;

  const chartData = useMemo(() => {
    const granularity: ChartGranularity = "day";
    const groups = new Map<string, ChartPoint>();
    const [chartStart, chartEnd] = getRange(period, customStart, customEnd);

    eachDayOfInterval({ start: chartStart, end: chartEnd }).forEach((date) => {
      const key = format(date, "yyyy-MM-dd");
      groups.set(key, { date: key, label: shortDate(key), gelir: 0, gider: 0, granularity });
    });

    storeTransactions.forEach((item) => {
      const key = item.date;
      const current = groups.get(key) ?? { date: key, label: shortDate(key), gelir: 0, gider: 0, granularity };
      current[item.type === "income" ? "gelir" : "gider"] += item.amount;
      groups.set(key, current);
    });
    return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [storeTransactions, period, customStart, customEnd]);

  const expenseData = useMemo(() => storeCategories.filter((category) => category.type === "expense").map((category, index) => ({
    name: category.name,
    value: storeTransactions.filter((item) => item.type === "expense" && item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0),
    color: category.color || expenseColors[index % expenseColors.length],
  })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), [storeCategories, storeTransactions]);

  const openTransaction = (type: TransactionType) => { setEditingTransaction(null); setTransactionType(type); setModal("transaction"); };
  const editTransaction = (transaction: Transaction) => { setEditingTransaction(transaction); setTransactionType(transaction.type); setModal("transaction"); };

  return (
    <main className="flex min-h-screen max-w-full overflow-x-hidden">
      <Sidebar view={view} setView={setView} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="min-w-0 max-w-full flex-1 overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#202831] bg-[#0a0e12]/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3"><MobileMenuButton onClick={() => setMobileOpen(true)} /><div><p className="text-[9px] uppercase tracking-[.14em] text-[#66717c]">Mithra Finans</p><h1 className="text-[13px] font-semibold">{view === "overview" ? "Genel bakış" : view === "products" ? "Ürünler ve stok" : view === "orders" ? "Siparişler" : view === "transactions" ? "İşlemler" : view === "categories" ? "Kategoriler" : "Mağazalar"}</h1></div></div>
          <div className="flex items-center gap-2">
            {isDemo && <span className="hidden rounded-full border border-[#42514c] bg-[#17231f] px-2.5 py-1 text-[9px] font-semibold text-[#73caba] sm:block">DEMO VERİSİ</span>}
            <StorePicker stores={stores} folders={folders} activeStore={activeStore} open={storePicker} onToggle={() => setStorePicker(!storePicker)} onClose={() => setStorePicker(false)} onSelect={(id) => { setActiveStoreId(id); setSelectedCategoryId(null); setChartDetail(null); setModal(null); setStorePicker(false); }} onAdd={() => { setStorePicker(false); setModal("store"); }} onManage={() => { setStorePicker(false); setView("stores"); }}/>

          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-4 md:p-6">
          {activeStore && view === "overview" && <Overview profitabilityPanel={<><ProfitabilityPanel key={activeStore.id} store={activeStore} categories={categories} transactions={storeTransactions} onSave={(profitSettings) => updateStore(activeStore.id, { profitSettings })}/><StoreProfitabilityTable stores={stores} categories={categories} transactions={periodTransactions} onSelect={setActiveStoreId}/></>} activeStore={activeStore} period={period} setPeriod={setPeriod} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} totalIncome={totalIncome} totalExpense={totalExpense} profit={profit} margin={margin} chartData={chartData} expenseData={expenseData} transactions={storeTransactions} categories={storeCategories} openTransaction={openTransaction} onEditTransaction={editTransaction} onChartSelect={(date, type, granularity) => setChartDetail({ date, type, granularity })} />}
          {activeStore && view === "products" && <ProductsView key={activeStore.id} store={activeStore} products={products.filter((item) => item.storeId === activeStore.id)} onAdd={addProduct} onUpdate={updateProduct} onStock={adjustStock}/>}
          {activeStore && view === "orders" && <OrdersView products={products.filter((item) => item.storeId === activeStore.id)} onProducts={() => setView("products")} key={activeStore.id} store={activeStore} orders={orders.filter((item) => item.storeId === activeStore.id)} onAdd={addOrder} onStage={updateOrderStage} onEdit={editOrderDetails} onUpdate={updateOrder} onDelete={deleteOrder} onComplete={completeOrder} onCancel={cancelOrder} />}
          {activeStore && view === "transactions" && <TransactionsView transactions={transactions.filter((item) => item.storeId === activeStore.id)} categories={storeCategories} store={activeStore} onAdd={() => openTransaction("income")} onEdit={editTransaction} />}
          {activeStore && view === "categories" && <CategoriesView categories={storeCategories} transactions={transactions} store={activeStore} onAdd={() => { setEditingCategory(null); setModal("category"); }} onEdit={(category) => { setEditingCategory(category); setModal("category"); }} onSelect={(category) => setSelectedCategoryId(category.id)} />}
          {view === "stores" && <StoresView products={products} stores={stores} folders={folders} orders={orders} categories={categories} transactions={transactions} onUpdate={updateStore} onDelete={deleteStore} onSaveFolder={saveFolder} onDeleteFolder={deleteFolder} onSelect={(id) => { setActiveStoreId(id); setSelectedCategoryId(null); setView("overview"); }} onAdd={() => setModal("store")} />}
          {!activeStore && view !== "stores" && <div className="panel rounded-2xl p-10 text-center"><h2 className="text-[18px] font-semibold">Henüz mağaza yok</h2><p className="mt-2 text-[11px] text-[#89939f]">Sipariş ve finans takibine başlamak için ilk mağazanızı oluşturun.</p><button onClick={() => setModal("store")} className="mt-5 rounded-xl bg-[#2dd4bf] px-4 py-3 text-[11px] font-bold text-[#07110f]">Mağaza oluştur</button></div>}
        </div>
      </div>

      {activeStore && modal === "transaction" && <TransactionModal key={editingTransaction?.id ?? "new"} open onClose={() => { setModal(null); setEditingTransaction(null); }} transaction={editingTransaction} type={transactionType} setType={setTransactionType} store={activeStore} categories={storeCategories} onSubmit={async (data) => {
        if (editingTransaction) {
          const result = await updateTransaction(editingTransaction.id, data);
          if (result.persisted) toast.success("İşlem güncellendi");
          else toast.info("İşlem demo modunda güncellendi; değişiklikler bu oturumda geçerli.");
        } else {
          await addTransaction(data);
          toast.success(data.type === "income" ? "Gelir kaydedildi" : "Gider kaydedildi");
        }
        setModal(null);
        setEditingTransaction(null);
      }} />}
      <StoreModal key={modal === "store" ? "open" : "closed"} folders={folders} open={modal === "store"} onClose={() => setModal(null)} onSubmit={async (data) => { const store = await addStore(data); const alreadyExists = stores.some((item) => item.id === store.id); setActiveStoreId(store.id); setModal(null); if (alreadyExists) toast.info("Bu mağaza zaten mevcut"); else toast.success("Mağaza oluşturuldu"); }} />
      {activeStore && <><CategoryModal open={modal === "category"} onClose={() => { setModal(null); setEditingCategory(null); }} storeId={activeStore.id} category={editingCategory} onSubmit={async (data) => { if (editingCategory) { await updateCategory(editingCategory.id, data); toast.success("Kategori güncellendi"); } else { await addCategory(data); toast.success("Kategori oluşturuldu"); } setModal(null); setEditingCategory(null); }} />
      <ChartDetailDrawer detail={chartDetail} onClose={() => setChartDetail(null)} transactions={storeTransactions} categories={storeCategories} store={activeStore} />
      <CategoryDetailDrawer key={selectedCategoryId ?? "closed"} category={storeCategories.find((category) => category.id === selectedCategoryId) ?? null} onClose={() => setSelectedCategoryId(null)} transactions={transactions.filter((item) => item.storeId === activeStore.id)} store={activeStore} /></>}
    </main>
  );
}

function Overview(props: { profitabilityPanel: ReactNode; activeStore: Store; period: Period; setPeriod: (p: Period) => void; customStart: string; customEnd: string; setCustomStart: (v: string) => void; setCustomEnd: (v: string) => void; totalIncome: number; totalExpense: number; profit: number; margin: number; chartData: ChartPoint[]; expenseData: { name: string; value: number; color: string }[]; transactions: import("@/lib/types").Transaction[]; categories: Category[]; openTransaction: (type: TransactionType) => void; onEditTransaction: (transaction: Transaction) => void; onChartSelect: (date: string, type: TransactionType, granularity: ChartGranularity) => void }) {
  const { activeStore: store } = props;
  return <>
    <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#2dd4bf] shadow-[0_0_10px_#2dd4bf]" /><p className="text-[10px] font-medium text-[#7f8994]">Finansal durum güncel</p></div><h2 className="mt-2 text-[20px] font-semibold tracking-[-.03em]">Merhaba, Mithra ekibi</h2><p className="mt-1 text-[11px] text-[#77818b]">{store.name} mağazasının performans özeti.</p></div>
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto"><div className="grid w-full grid-cols-5 rounded-xl border border-[#27303a] bg-[#0d1217] p-1 sm:flex sm:w-auto">{PERIODS.map((item) => <button key={item.id} onClick={() => props.setPeriod(item.id)} className={`rounded-lg px-2 py-1.5 text-[9px] font-semibold transition sm:px-3 ${props.period === item.id ? "bg-[#26312f] text-[#79dfd2]" : "text-[#6f7a84] hover:text-white"}`}>{item.label}</button>)}</div>{props.period === "custom" && <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-[#27303a] bg-[#0d1217] p-1.5"><CalendarDays size={13} className="ml-1 shrink-0 text-[#78838d]" /><input type="date" value={props.customStart} onChange={(e) => props.setCustomStart(e.target.value)} className="min-w-[108px] bg-transparent text-[9px] text-[#aeb7bf] outline-none" /><span className="text-[#4e5963]">—</span><input type="date" value={props.customEnd} onChange={(e) => props.setCustomEnd(e.target.value)} className="min-w-[108px] bg-transparent text-[9px] text-[#aeb7bf] outline-none" /></div>}<button onClick={() => props.openTransaction("expense")} className="rounded-xl border border-[#303840] bg-[#151b21] px-3.5 py-2 text-[10px] font-semibold text-[#d8dde1] hover:border-[#56606a]">Gider ekle</button><button onClick={() => props.openTransaction("income")} className="flex items-center gap-2 rounded-xl bg-[#2dd4bf] px-3.5 py-2 text-[10px] font-bold text-[#06110f] hover:bg-[#5ee0d0]"><Plus size={14} />Gelir ekle</button></div>
    </div>
    {props.profitabilityPanel}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Gelir-gider farkı" value={money(props.profit, store.currency)} note="Kaydedilmiş tüm gelirler − giderler" icon={TrendingUp} tone="teal" />
      <Metric title="Toplam gelir" value={money(props.totalIncome, store.currency)} note={`${props.transactions.filter(t => t.type === "income").length} gelir kaydı`} icon={ArrowUpRight} tone="blue" />
      <Metric title="Toplam gider" value={money(props.totalExpense, store.currency)} note={`${props.transactions.filter(t => t.type === "expense").length} gider kaydı`} icon={ArrowDownRight} tone="red" />
      <Metric title="Kayıt marjı" value={`%${props.margin.toFixed(1)}`} note="Gelire göre net marj" icon={WalletCards} tone="amber" />
    </div>
    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.7fr)]">
      <section className="panel min-h-[360px] rounded-2xl p-4 md:p-5"><SectionTitle title="Gelir ve gider akışı" subtitle="Günün üzerine gelin, gelir veya gider noktasına tıklayın" action={<button className="flex items-center gap-1.5 text-[9px] text-[#84909a]"><Download size={12} />Dışa aktar</button>} /><div className="mt-5 h-[278px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={props.chartData} margin={{ left: -24, right: 4, top: 10 }}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" stopOpacity={.28}/><stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/></linearGradient><linearGradient id="expense" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff7468" stopOpacity={.12}/><stop offset="95%" stopColor="#ff7468" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#252d35" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#68737d", fontSize: 9 }} minTickGap={25}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#68737d", fontSize: 9 }} tickFormatter={(v) => `${Math.round(v/1000)}K`}/><Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload as ChartPoint | undefined; if (!active || !point) return null; const pointItems = props.transactions.filter(item => point.granularity === "month" ? item.date.startsWith(point.date) : item.date === point.date); return <div className="min-w-[190px] rounded-xl border border-[#2c3740] bg-[#111820] p-3 shadow-2xl"><p className="text-[9px] font-semibold text-white">{point.label} özeti</p><div className="mt-2.5 space-y-2"><div className="flex items-center justify-between gap-5"><span className="text-[9px] text-[#6ddccd]">Gelir · {pointItems.filter(item => item.type === "income").length} kayıt</span><strong className="text-[10px] text-[#6ddccd]">{money(point.gelir, store.currency)}</strong></div><div className="flex items-center justify-between gap-5"><span className="text-[9px] text-[#ff887d]">Gider · {pointItems.filter(item => item.type === "expense").length} kayıt</span><strong className="text-[10px] text-[#ff887d]">{money(point.gider, store.currency)}</strong></div></div><p className="mt-2.5 border-t border-[#29323a] pt-2 text-[8px] text-[#68737d]">Detay için renkli noktaya tıklayın</p></div>; }}/><Area type="monotone" dataKey="gelir" stroke="#2dd4bf" strokeWidth={2} fill="url(#income)" activeDot={(dotProps) => <ClickableDot {...dotProps} color="#2dd4bf" onSelect={(date, granularity) => props.onChartSelect(date, "income", granularity)} />} /><Area type="monotone" dataKey="gider" stroke="#ff7468" strokeWidth={1.5} fill="url(#expense)" activeDot={(dotProps) => <ClickableDot {...dotProps} color="#ff7468" onSelect={(date, granularity) => props.onChartSelect(date, "expense", granularity)} />} /></AreaChart></ResponsiveContainer></div></section>
      <section className="panel min-h-[360px] rounded-2xl p-4 md:p-5"><SectionTitle title="Gider dağılımı" subtitle="Kategori bazında harcamalar" /><div className="relative mx-auto mt-3 h-[190px] max-w-[260px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={props.expenseData} innerRadius={60} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">{props.expenseData.map((item) => <Cell key={item.name} fill={item.color}/>)}</Pie></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[9px] text-[#77818b]">Toplam gider</p><p className="mt-1 text-[14px] font-bold">{money(props.totalExpense, store.currency, true)}</p></div></div></div><div className="space-y-2.5">{props.expenseData.slice(0, 4).map((item) => <div key={item.name} className="flex items-center text-[9px]"><span className="mr-2 h-2 w-2 rounded-full" style={{ background: item.color }}/><span className="flex-1 text-[#9ba5ae]">{item.name}</span><span className="font-semibold">{money(item.value, store.currency)}</span><span className="ml-2 w-9 text-right text-[#66717c]">%{props.totalExpense ? Math.round(item.value / props.totalExpense * 100) : 0}</span></div>)}</div></section>
    </div>
    <section className="panel mt-3 rounded-2xl p-4 md:p-5"><SectionTitle title="Son hareketler" subtitle="Seçili dönemin en güncel kayıtları" action={<button className="text-[9px] font-semibold text-[#55d5c6]">Tümünü gör</button>} /><TransactionTable transactions={props.transactions.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 7)} categories={props.categories} store={store} onEdit={props.onEditTransaction} /></section>
  </>;
}

function ClickableDot({ cx = 0, cy = 0, payload, color, onSelect }: { cx?: number; cy?: number; payload?: Partial<ChartPoint>; color: string; onSelect: (date: string, granularity: ChartGranularity) => void }) {
  if (!payload?.date) return <circle cx={cx} cy={cy} r={4} fill={color} />;
  const granularity = payload.granularity ?? "day";
  return <circle cx={cx} cy={cy} r={6} fill={color} stroke="#0d1217" strokeWidth={3} className="cursor-pointer outline-none" role="button" tabIndex={0} aria-label={`${payload.date} detaylarını aç`} onClick={() => onSelect(payload.date!, granularity)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(payload.date!, granularity); }} />;
}

function Metric({ title, value, note, icon: Icon, tone }: { title: string; value: string; note: string; icon: typeof TrendingUp; tone: "teal" | "blue" | "red" | "amber" }) {
  const colors = { teal: "bg-[#18312d] text-[#55d9c8]", blue: "bg-[#182837] text-[#69bdf9]", red: "bg-[#362020] text-[#ff8075]", amber: "bg-[#342d1c] text-[#f4bd67]" };
  return <div className="panel rounded-2xl p-4"><div className="flex items-start justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#77818b]">{title}</p><p className="mt-3 text-[21px] font-semibold tracking-[-.04em]">{value}</p><p className="mt-1.5 text-[9px] text-[#68737d]">{note}</p></div><span className={`rounded-xl p-2.5 ${colors[tone]}`}><Icon size={16} /></span></div></div>;
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="flex items-start justify-between"><div><h3 className="text-[11px] font-semibold">{title}</h3><p className="mt-1 text-[9px] text-[#68737d]">{subtitle}</p></div>{action}</div>; }

function TransactionTable({ transactions, categories, store, onEdit }: { transactions: Transaction[]; categories: Category[]; store: Store; onEdit: (transaction: Transaction) => void }) {
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] border-collapse"><thead><tr className="border-b border-[#27303a] text-left text-[8px] uppercase tracking-[.12em] text-[#59646f]"><th className="pb-2.5 font-semibold">İşlem</th><th className="pb-2.5 font-semibold">Kategori</th><th className="pb-2.5 font-semibold">Tarih</th><th className="pb-2.5 text-right font-semibold">Tutar</th><th className="w-24 pb-2.5 text-right font-semibold">Düzenle</th></tr></thead><tbody>{transactions.map((item) => { const category = categories.find(c => c.id === item.categoryId); return <tr key={item.id} className="border-b border-[#20272e] last:border-0"><td className="py-3"><div className="flex items-center gap-2.5"><span className={`grid h-7 w-7 place-items-center rounded-lg ${item.type === "income" ? "bg-[#17302b] text-[#57d6c6]" : "bg-[#321f1e] text-[#ff8277]"}`}>{item.type === "income" ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}</span><div><p className="max-w-[280px] truncate text-[10px] font-medium">{item.title}</p><p className="mt-0.5 text-[8px] text-[#626d77]">{item.note || "Manuel kayıt"}</p></div></div></td><td className="py-3"><span className="rounded-md bg-white/[.035] px-2 py-1 text-[8px] text-[#9da6ae]">{category?.name || "Kategorisiz"}</span></td><td className="py-3 text-[9px] text-[#78838d]">{shortDate(item.date)}</td><td className={`py-3 text-right text-[10px] font-semibold ${item.type === "income" ? "text-[#6bdccc]" : "text-[#ff8b81]"}`}>{item.type === "income" ? "+" : "−"}{money(item.amount, store.currency)}</td><td className="py-3 text-right"><button type="button" onClick={() => onEdit(item)} aria-label={`${item.title} işlemini düzenle`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#29333c] px-2 py-1.5 text-[9px] text-[#7d8993] transition hover:border-[#44515b] hover:bg-white/[.04] hover:text-white"><Pencil size={12}/><span>Düzenle</span></button></td></tr>; })}{!transactions.length && <tr><td colSpan={5} className="py-14 text-center text-[10px] text-[#68737d]">Bu dönem için kayıt bulunmuyor.</td></tr>}</tbody></table></div>;
}

function ChartDetailDrawer({ detail, onClose, transactions, categories, store }: { detail: { date: string; type: TransactionType; granularity: ChartGranularity } | null; onClose: () => void; transactions: import("@/lib/types").Transaction[]; categories: Category[]; store: Store }) {
  if (!detail) return null;
  const items = transactions.filter((item) => (detail.granularity === "month" ? item.date.startsWith(detail.date) : item.date === detail.date) && item.type === detail.type);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const dateLabel = detail.granularity === "month" ? `${monthLabels[Number(detail.date.slice(5, 7)) - 1]} ${detail.date.slice(0, 4)}` : new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${detail.date}T12:00:00`));
  return <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose}><aside className="absolute inset-y-0 right-0 flex w-full max-w-[430px] flex-col border-l border-[#27313a] bg-[#0d1217] shadow-[-24px_0_70px_rgba(0,0,0,.38)]" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between border-b border-[#252e36] p-5"><div><span className={`mb-3 inline-flex rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-[.1em] ${detail.type === "income" ? "bg-[#17302b] text-[#68ddcd]" : "bg-[#351f1e] text-[#ff887d]"}`}>{detail.type === "income" ? "Gelir detayları" : "Gider detayları"}</span><h2 className="text-[16px] font-semibold">{dateLabel}</h2><p className="mt-1 text-[9px] text-[#74808a]">Grafikte seçilen günün tüm {detail.type === "income" ? "gelir" : "gider"} kayıtları</p></div><button onClick={onClose} className="rounded-lg border border-[#2a343d] p-2 text-[#85909a] hover:bg-white/[.04] hover:text-white" aria-label="Detay panelini kapat"><X size={15}/></button></div><div className="border-b border-[#252e36] p-5"><p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#69747e]">Günlük toplam</p><div className="mt-2 flex items-end justify-between"><p className={`text-[25px] font-semibold tracking-[-.04em] ${detail.type === "income" ? "text-[#68ddcd]" : "text-[#ff887d]"}`}>{money(total, store.currency)}</p><p className="mb-1 text-[9px] text-[#74808a]">{items.length} kayıt</p></div></div><div className="flex-1 overflow-y-auto p-4"><div className="space-y-2">{items.map((item) => { const category = categories.find((entry) => entry.id === item.categoryId); return <div key={item.id} className="rounded-xl border border-[#252e36] bg-[#12181e] p-4"><div className="flex items-start gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${detail.type === "income" ? "bg-[#18322d] text-[#69ddce]" : "bg-[#35201f] text-[#ff887d]"}`}>{detail.type === "income" ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="truncate text-[10px] font-semibold">{item.title}</p><p className={`shrink-0 text-[10px] font-bold ${detail.type === "income" ? "text-[#69ddce]" : "text-[#ff887d]"}`}>{money(item.amount, store.currency)}</p></div><div className="mt-2 flex items-center gap-2"><span className="rounded-md bg-white/[.04] px-2 py-1 text-[8px] text-[#98a2ab]">{category?.name || "Kategorisiz"}</span>{item.note && <span className="truncate text-[8px] text-[#65717c]">{item.note}</span>}</div></div></div></div>; })}{!items.length && <div className="py-16 text-center"><p className="text-[11px] font-medium text-[#98a2ab]">Bu gün için kayıt yok</p><p className="mt-1 text-[9px] text-[#66717c]">Seçilen grafik türünde işlem bulunamadı.</p></div>}</div></div></aside></div>;
}

type CategoryFilter = "all" | "day" | "week" | "month" | "year";

function CategoryDetailDrawer({ category, onClose, transactions, store }: { category: Category | null; onClose: () => void; transactions: import("@/lib/types").Transaction[]; store: Store }) {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  if (!category) return null;

  const now = new Date();
  const filtered = transactions.filter((item) => {
    if (item.categoryId !== category.id) return false;
    const matchesQuery = `${item.title} ${item.note ?? ""}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"));
    if (!matchesQuery || filter === "all") return matchesQuery;
    const itemDate = new Date(`${item.date}T12:00:00`);
    const starts = { day: startOfDay(now), week: startOfWeek(now, { weekStartsOn: 1 }), month: startOfMonth(now), year: startOfYear(now) };
    return itemDate >= starts[filter] && itemDate <= endOfDay(now);
  }).sort((a, b) => b.date.localeCompare(a.date));
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);
  const filters: { id: CategoryFilter; label: string }[] = [{ id: "all", label: "Tümü" }, { id: "day", label: "Bugün" }, { id: "week", label: "Hafta" }, { id: "month", label: "Ay" }, { id: "year", label: "Yıl" }];

  return <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose}><aside className="absolute inset-y-0 right-0 flex w-full max-w-[470px] flex-col border-l border-[#27313a] bg-[#0d1217] shadow-[-24px_0_70px_rgba(0,0,0,.38)]" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between border-b border-[#252e36] p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${category.color}18`, color: category.color }}><Layers3 size={17}/></span><div><span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold ${category.type === "income" ? "bg-[#17302b] text-[#68ddcd]" : "bg-[#351f1e] text-[#ff887d]"}`}>{category.type === "income" ? "Gelir kategorisi" : "Gider kategorisi"}</span><h2 className="mt-2 text-[16px] font-semibold">{category.name}</h2><p className="mt-1 text-[9px] text-[#74808a]">Bu kategoriye bağlı işlemler</p></div></div><button onClick={onClose} className="rounded-lg border border-[#2a343d] p-2 text-[#85909a] hover:bg-white/[.04] hover:text-white" aria-label="Kategori detayını kapat"><X size={15}/></button></div><div className="border-b border-[#252e36] p-4"><div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-[#65717c]"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-2 pl-9 text-[10px]" placeholder="İşlem veya not ara..."/></div><div className="mt-3 grid grid-cols-5 rounded-xl border border-[#27303a] bg-[#0a0f14] p-1">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-lg px-1 py-1.5 text-[8px] font-semibold transition ${filter === item.id ? "bg-[#26312f] text-[#79dfd2]" : "text-[#6f7a84] hover:text-white"}`}>{item.label}</button>)}</div><div className="mt-4 flex items-end justify-between"><div><p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#69747e]">Filtrelenmiş toplam</p><p className={`mt-1 text-[23px] font-semibold tracking-[-.04em] ${category.type === "income" ? "text-[#68ddcd]" : "text-[#ff887d]"}`}>{money(total, store.currency)}</p></div><p className="mb-1 text-[9px] text-[#74808a]">{filtered.length} kayıt</p></div></div><div className="flex-1 overflow-y-auto p-4"><div className="space-y-2">{filtered.map((item) => <div key={item.id} className="rounded-xl border border-[#252e36] bg-[#12181e] p-4"><div className="flex items-start gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${category.type === "income" ? "bg-[#18322d] text-[#69ddce]" : "bg-[#35201f] text-[#ff887d]"}`}>{category.type === "income" ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="truncate text-[10px] font-semibold">{item.title}</p><p className={`shrink-0 text-[10px] font-bold ${category.type === "income" ? "text-[#69ddce]" : "text-[#ff887d]"}`}>{money(item.amount, store.currency)}</p></div><p className="mt-1 text-[8px] text-[#69747e]">{shortDate(item.date)}{item.note ? ` · ${item.note}` : ""}</p></div></div></div>)}{!filtered.length && <div className="py-16 text-center"><p className="text-[11px] font-medium text-[#98a2ab]">İşlem bulunamadı</p><p className="mt-1 text-[9px] text-[#66717c]">Arama veya dönem filtresini değiştirebilirsiniz.</p></div>}</div></div></aside></div>;
}

function TransactionsView({ transactions, categories, store, onAdd, onEdit }: { transactions: Transaction[]; categories: Category[]; store: Store; onAdd: () => void; onEdit: (transaction: Transaction) => void }) { const [query, setQuery] = useState(""); const filtered = transactions.filter(t => t.title.toLowerCase().includes(query.toLowerCase())); return <PageShell title="Tüm işlemler" description={`${store.name} mağazasındaki gelir ve gider kayıtları`} action={<button onClick={onAdd} className="flex items-center gap-2 rounded-xl bg-[#2dd4bf] px-3.5 py-2 text-[10px] font-bold text-[#07110f]"><Plus size={14}/>Yeni işlem</button>}><div className="panel rounded-2xl p-4 md:p-5"><div className="relative max-w-xs"><Search size={14} className="absolute left-3 top-2.5 text-[#65717c]"/><input value={query} onChange={e => setQuery(e.target.value)} className="input py-2 pl-9 text-[10px]" placeholder="İşlem ara..." /></div><TransactionTable transactions={filtered.slice().sort((a,b) => b.date.localeCompare(a.date))} categories={categories} store={store} onEdit={onEdit}/></div></PageShell>; }

function CategoriesView({ categories, transactions, store, onAdd, onEdit, onSelect }: { categories: Category[]; transactions: import("@/lib/types").Transaction[]; store: Store; onAdd: () => void; onEdit: (category: Category) => void; onSelect: (category: Category) => void }) { return <PageShell title="Kategoriler" description="Gelir ve giderlerinizi size uygun başlıklarla düzenleyin" action={<button onClick={onAdd} className="flex items-center gap-2 rounded-xl bg-[#2dd4bf] px-3.5 py-2 text-[10px] font-bold text-[#07110f]"><Plus size={14}/>Kategori oluştur</button>}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map(category => { const categoryTransactions = transactions.filter(t => t.categoryId === category.id); const total = categoryTransactions.reduce((s,t) => s+t.amount, 0); return <div key={category.id} role="button" tabIndex={0} onClick={() => onSelect(category)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(category); }} className="panel cursor-pointer rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-[#3b4a52] focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]/20"><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${category.color}18`, color: category.color }}><Layers3 size={16}/></span><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[8px] font-semibold ${category.type === "income" ? "bg-[#17302b] text-[#65d9ca]" : "bg-[#321f1e] text-[#ff847a]"}`}>{category.type === "income" ? "Gelir" : "Gider"}</span><button onClick={(event) => { event.stopPropagation(); onEdit(category); }} onKeyDown={(event) => event.stopPropagation()} className="rounded-lg border border-[#29333c] p-1.5 text-[#7d8993] transition hover:border-[#44515b] hover:bg-white/[.04] hover:text-white" aria-label={`${category.name} kategorisini düzenle`}><Pencil size={12}/></button></div></div><p className="mt-5 text-[11px] font-semibold">{category.name}</p><p className="mt-1 text-[9px] text-[#68737d]">{categoryTransactions.length} işlem · Detayları görmek için açın</p><p className="mt-4 text-[15px] font-semibold">{money(total, store.currency)}</p></div>})}</div></PageShell>; }

function PageShell({ title, description, action, children }: { title: string; description: string; action: React.ReactNode; children: React.ReactNode }) { return <><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-[20px] font-semibold tracking-[-.03em]">{title}</h2><p className="mt-1 text-[10px] text-[#77818b]">{description}</p></div>{action}</div>{children}</>; }

function useSubmissionLock() {
  const lockRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const runOnce = async (action: () => Promise<void>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setSubmitting(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İşlem kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      lockRef.current = false;
      setSubmitting(false);
    }
  };

  return { submitting, runOnce };
}

function TransactionModal({ open, onClose, transaction, type, setType, store, categories, onSubmit }: { open: boolean; onClose: () => void; transaction: Transaction | null; type: TransactionType; setType: (v: TransactionType) => void; store: Store; categories: Category[]; onSubmit: (data: Omit<Transaction, "id">) => Promise<void> }) {
  const matching = categories.filter(c => c.type === type);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const { submitting, runOnce } = useSubmissionLock();
  const close = () => { if (!submitting) onClose(); };

  return <Modal open={open} onClose={close} title={transaction ? "İşlemi düzenle" : "Yeni finansal kayıt"} description={transaction ? "Yanlış girilen bilgileri düzeltip değişiklikleri kaydedin." : `${store.name} mağazası için gelir veya gider ekleyin.`}>
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      void runOnce(async () => {
        const fields = new FormData(form);
        const title = String(fields.get("title") ?? "").trim();
        const amount = Number(fields.get("amount"));
        if (!title || !Number.isFinite(amount) || amount <= 0 || !matching.some(category => category.id === categoryId)) {
          toast.error("İşlem adı, tutar ve kategoriyi kontrol edin.");
          return;
        }
        try {
          await onSubmit({ storeId: store.id, type, title, amount, categoryId, date: String(fields.get("date")), note: String(fields.get("note") || "") });
        } catch {
          toast.error("İşlem kaydedilemedi. Bilgilerinizi ve bağlantınızı kontrol edip tekrar deneyin.");
        }
      });
    }}>
      <div className="grid grid-cols-2 rounded-xl bg-[#0b1015] p-1">
        {(["income", "expense"] as const).map(value => <button disabled={submitting || Boolean(transaction?.orderId)} type="button" key={value} onClick={() => { if (value !== type) { setType(value); setCategoryId(""); } }} className={`rounded-lg py-2 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${type === value ? (value === "income" ? "bg-[#19332e] text-[#62ddcd]" : "bg-[#37201f] text-[#ff8b81]") : "text-[#66717c]"}`}>{value === "income" ? "Gelir" : "Gider"}</button>)}
      </div>
      {transaction?.orderId && <p className="text-[10px] leading-5 text-[#89939f]">Bu kayıt bir siparişe bağlıdır; işlem türü sabittir. Tutar değişikliği ilgili siparişe de yansır.</p>}
      <Field label="İşlem adı"><input required disabled={submitting} name="title" defaultValue={transaction?.title ?? ""} className="input" placeholder={type === "income" ? "Örn. Shopify satışları" : "Örn. Meta reklam harcaması"}/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Tutar (${store.currency})`}><input required disabled={submitting} min="0.01" step="0.01" type="number" name="amount" defaultValue={transaction?.amount ?? ""} className="input" placeholder="0,00"/></Field>
        <Field label="Tarih"><input required disabled={submitting} type="date" name="date" defaultValue={transaction?.date ?? format(new Date(), "yyyy-MM-dd")} className="input"/></Field>
      </div>
      <Field label="Kategori"><select required disabled={submitting} name="categoryId" value={matching.some(category => category.id === categoryId) ? categoryId : ""} onChange={event => setCategoryId(event.target.value)} className="input"><option value="">Kategori seçin</option>{matching.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
      {!matching.length && <p className="text-[10px] text-[#f4b860]">Bu işlem türü için önce Kategoriler bölümünden bir kategori oluşturun.</p>}
      <Field label="Not (isteğe bağlı)"><textarea disabled={submitting} name="note" defaultValue={transaction?.note ?? ""} className="input min-h-20 resize-none" placeholder="Kısa bir açıklama ekleyin..."/></Field>
      <div className="flex gap-2">
        <button type="button" onClick={close} disabled={submitting} className="rounded-xl border border-[#303840] px-4 py-3 text-[10px] font-semibold text-[#d8dde1] disabled:cursor-not-allowed disabled:opacity-60">Vazgeç</button>
        <button disabled={submitting || !matching.length} className="flex-1 rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Kaydediliyor…" : transaction ? "Değişiklikleri kaydet" : "Kaydı oluştur"}</button>
      </div>
    </form>
  </Modal>;
}

function StoreModal({ open, onClose, onSubmit, folders }: { open: boolean; onClose: () => void; folders: StoreFolder[]; onSubmit: (data: Omit<Store, "id">) => Promise<void> }) {
  const { submitting, runOnce } = useSubmissionLock();
  const close = () => { if (!submitting) onClose(); };
  return <Modal open={open} onClose={close} title="Yeni mağaza" description="Shopify mağazanız için ayrı bir finans çalışma alanı oluşturun."><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault(); const form = event.currentTarget;
    void runOnce(async () => {
      const data = new FormData(form);
      try { await onSubmit({ name: String(data.get("name")).trim(), domain: String(data.get("domain")).trim(), currency: String(data.get("currency")) as Store["currency"], status: "active", color: String(data.get("color")), folderId: String(data.get("folderId") ?? "") || null }); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Mağaza oluşturulamadı."); }
    });
  }}><Field label="Mağaza adı"><input required disabled={submitting} name="name" className="input" placeholder="Örn. North Atelier"/></Field><Field label="Mağaza domaini"><input required disabled={submitting} name="domain" className="input" placeholder="magazam.myshopify.com"/></Field><Field label="Klasör (isteğe bağlı)"><select disabled={submitting} name="folderId" className="input"><option value="">Klasörsüz</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></Field><div className="grid grid-cols-[1fr_70px] gap-3"><Field label="Para birimi"><select disabled={submitting} name="currency" defaultValue="AZN" className="input"><option>AZN</option><option>USD</option><option>EUR</option><option>TRY</option></select></Field><Field label="Renk"><input disabled={submitting} type="color" name="color" defaultValue="#2dd4bf" className="input h-[39px] p-1.5"/></Field></div><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Oluşturuluyor…" : "Mağazayı oluştur"}</button></form></Modal>;
}

function CategoryModal({ open, onClose, storeId, category, onSubmit }: { open: boolean; onClose: () => void; storeId: string; category: Category | null; onSubmit: (data: Omit<Category, "id">) => Promise<void> }) {
  const { submitting, runOnce } = useSubmissionLock();
  return <Modal open={open} onClose={onClose} title={category ? "Kategoriyi düzenle" : "Yeni kategori"} description={category ? "Kategori adı, türü ve rapor rengini güncelleyin." : "Raporlarda kullanacağınız özel bir gelir veya gider başlığı ekleyin."}><form className="space-y-4" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; void runOnce(async () => { const f = new FormData(form); await onSubmit({ storeId, name: String(f.get("name")), type: String(f.get("type")) as TransactionType, color: String(f.get("color")) }); }); }}><Field label="Kategori adı"><input required disabled={submitting} name="name" defaultValue={category?.name ?? ""} className="input" placeholder="Örn. Influencer reklamları"/></Field><div className="grid grid-cols-[1fr_70px] gap-3"><Field label="Kategori tipi"><select disabled={submitting} name="type" defaultValue={category?.type ?? "expense"} className="input"><option value="expense">Gider</option><option value="income">Gelir</option></select></Field><Field label="Renk"><input disabled={submitting} type="color" name="color" defaultValue={category?.color ?? "#f4b860"} className="input h-[39px] p-1.5"/></Field></div><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Kaydediliyor…" : category ? "Değişiklikleri kaydet" : "Kategoriyi oluştur"}</button></form></Modal>;
}
