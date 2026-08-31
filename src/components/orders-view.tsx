"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, Clock3, MapPin, MessageCircle, PackageCheck, Pencil, PhoneOutgoing, Plus, Search, UserRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import type { Order, OrderStage, Store } from "@/lib/types";
import { Field, Modal } from "./modal";

type Filter = "active" | "completed" | "cancelled" | "all";
type DateFilter = "all" | "today" | "week" | "month" | "custom";

const inputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function getDateRange(filter: DateFilter, customStart: string, customEnd: string) {
  if (filter === "all") return null;
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (filter === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (filter === "month") start.setDate(1);
  if (filter === "custom") {
    if (!customStart || !customEnd) return null;
    return [new Date(`${customStart}T00:00:00`), new Date(`${customEnd}T23:59:59.999`)] as const;
  }
  return [start, end] as const;
}

const steps: { stage: Exclude<OrderStage, "new">; title: string; description: string; icon: typeof Check }[] = [
  { stage: "contacted", title: "Kişiye yazıldı", description: "Müşteriyle iletişime geçildi", icon: PhoneOutgoing },
  { stage: "responded", title: "Geri dönüş alındı", description: "Müşteri cevabı ve notu", icon: MessageCircle },
  { stage: "addressed", title: "Konum ve kargo", description: "Adres alındı, kargo gideri girildi", icon: MapPin },
  { stage: "delivered", title: "Teslim edildi", description: "Gelir ve kargo finansa aktarılır", icon: PackageCheck },
];

const stageOrder: OrderStage[] = ["new", "contacted", "responded", "addressed", "delivered"];

type Props = {
  store: Store;
  orders: Order[];
  onAdd: (order: Pick<Order, "storeId" | "customerName" | "product" | "amount">) => Promise<Order>;
  onStage: (id: string, stage: OrderStage, details?: Partial<Pick<Order, "responseNote" | "addressNote" | "shippingCost">>) => Promise<void>;
  onEdit: (id: string, details: Partial<Pick<Order, "responseNote" | "addressNote" | "shippingCost">>) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onCancel: (id: string, chargeShipping: boolean, note: string) => Promise<void>;
};

export function OrdersView({ store, orders, onAdd, onStage, onEdit, onComplete, onCancel }: Props) {
  const [filter, setFilter] = useState<Filter>("active");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customStart, setCustomStart] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 30); return inputDate(date); });
  const [customEnd, setCustomEnd] = useState(() => inputDate(new Date()));
  const [query, setQuery] = useState("");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<"response" | "address" | "delivery" | "cancel" | null>(null);
  const [editingAction, setEditingAction] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selected = orders.find((item) => item.id === selectedId) ?? null;

  const counts = useMemo(() => ({
    active: orders.filter((item) => item.status === "active").length,
    completed: orders.filter((item) => item.status === "completed").length,
    cancelled: orders.filter((item) => item.status === "cancelled").length,
  }), [orders]);

  const filtered = useMemo(() => orders.filter((item) => {
    const matchesFilter = filter === "all" || item.status === filter;
    const range = getDateRange(dateFilter, customStart, customEnd);
    const createdAt = new Date(item.createdAt);
    const matchesDate = !range || (!Number.isNaN(createdAt.getTime()) && createdAt >= range[0] && createdAt <= range[1]);
    const term = query.trim().toLocaleLowerCase("tr-TR");
    return matchesFilter && matchesDate && (!term || `${item.customerName} ${item.product}`.toLocaleLowerCase("tr-TR").includes(term));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [orders, filter, dateFilter, customStart, customEnd, query]);

  const run = async (job: () => Promise<void>) => {
    if (submitting) return;
    setSubmitting(true);
    try { await job(); } finally { setSubmitting(false); }
  };

  const advance = async (order: Order, stage: Exclude<OrderStage, "new">) => {
    if (order.status === "cancelled") return;
    const currentIndex = stageOrder.indexOf(order.stage);
    const targetIndex = stageOrder.indexOf(stage);
    const isNext = order.status === "active" && currentIndex + 1 === targetIndex;
    const isEditable = currentIndex >= targetIndex && (stage === "responded" || stage === "addressed");
    if (!isNext && !isEditable) return;
    setSelectedId(order.id);
    setEditingAction(isEditable);
    if (isEditable) {
      setAction(stage === "responded" ? "response" : "address");
      return;
    }
    if (stage === "contacted") {
      await run(async () => { await onStage(order.id, stage); toast.success("Kişiye yazıldı olarak işaretlendi"); });
    } else setAction(stage === "responded" ? "response" : stage === "addressed" ? "address" : "delivery");
  };

  const closeAction = () => { if (!submitting) setAction(null); };

  return <>
    <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><h2 className="text-[20px] font-semibold tracking-[-.03em]">Siparişler</h2><p className="mt-1 text-[10px] text-[#77818b]">Siparişi ilk kayıttan teslimata kadar takip edin; teslim edilenler otomatik olarak finansa işlensin.</p></div>
      <button onClick={() => setNewOrderOpen(true)} className="flex w-fit items-center gap-2 rounded-xl bg-[#2dd4bf] px-4 py-2.5 text-[10px] font-bold text-[#07110f]"><Plus size={14}/>Yeni sipariş</button>
    </div>

    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <SummaryCard label="Devam eden" value={counts.active} icon={Clock3} color="#57b8ff" />
      <SummaryCard label="Tamamlanan" value={counts.completed} icon={CheckCircle2} color="#2dd4bf" />
      <SummaryCard label="İptal edilen" value={counts.cancelled} icon={XCircle} color="#ff7468" />
    </div>

    <div className="panel rounded-2xl p-3 md:p-4">
      <div className="mb-4 border-b border-[#252e36] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl bg-[#0b1015] p-1">
            {([{ id: "active", label: "Devam eden" }, { id: "completed", label: "Tamamlanan" }, { id: "cancelled", label: "İptal" }, { id: "all", label: "Tümü" }] as const).map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-lg px-3 py-2 text-[9px] font-semibold transition ${filter === item.id ? "bg-[#24302e] text-[#6cddcf]" : "text-[#707b86] hover:text-white"}`}>{item.label}</button>)}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-[180px]"><CalendarDays size={15} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#65717c]"/><select aria-label="Oluşturulma tarihi filtresi" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="input py-2 text-[10px]" style={{ paddingLeft: "2.6rem", paddingRight: "2.25rem" }}><option value="all">Tüm tarihler</option><option value="today">Bugün oluşturulan</option><option value="week">Bu hafta oluşturulan</option><option value="month">Bu ay oluşturulan</option><option value="custom">Özel tarih aralığı</option></select></div>
            <div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#65717c]"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-2 text-[10px]" style={{ paddingLeft: "2.6rem" }} placeholder="Kişi veya sipariş ara..."/></div>
          </div>
        </div>
        {dateFilter === "custom" && <div className="mt-3 flex flex-wrap items-end justify-end gap-2"><label className="text-[8px] font-semibold uppercase tracking-[.1em] text-[#707b85]">Başlangıç<input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} className="input mt-1 block py-2 text-[9px]"/></label><label className="text-[8px] font-semibold uppercase tracking-[.1em] text-[#707b85]">Bitiş<input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} className="input mt-1 block py-2 text-[9px]"/></label></div>}
      </div>

      <div className="grid gap-3">
        {filtered.map((order) => <OrderCard key={order.id} order={order} store={store} submitting={submitting} onAdvance={(stage) => void advance(order, stage)} onCancel={() => { setSelectedId(order.id); setAction("cancel"); }}/>) }
      </div>
      {!filtered.length && <div className="py-16 text-center"><PackageCheck className="mx-auto text-[#3f4a54]" size={28}/><p className="mt-3 text-[11px] font-semibold text-[#a0aab3]">Bu filtrelerde sipariş yok</p><p className="mt-1 text-[9px] text-[#66717c]">Durum, tarih veya arama filtresini değiştirebilirsiniz.</p></div>}
    </div>

    <NewOrderModal open={newOrderOpen} store={store} submitting={submitting} onClose={() => setNewOrderOpen(false)} onSubmit={(data) => run(async () => { await onAdd(data); setNewOrderOpen(false); setFilter("active"); toast.success("Sipariş oluşturuldu"); })}/>
    <ResponseModal open={action === "response"} editing={editingAction} initialNote={selected?.responseNote ?? ""} submitting={submitting} onClose={closeAction} onSubmit={(note) => selected && run(async () => { if (editingAction) await onEdit(selected.id, { responseNote: note }); else await onStage(selected.id, "responded", { responseNote: note }); setAction(null); toast.success(editingAction ? "Geri dönüş notu güncellendi" : "Geri dönüş kaydedildi"); })}/>
    <AddressModal open={action === "address"} editing={editingAction} initialAddress={selected?.addressNote ?? ""} initialShipping={selected?.shippingCost ?? 0} store={store} submitting={submitting} onClose={closeAction} onSubmit={(addressNote, shippingCost) => selected && run(async () => { if (editingAction) await onEdit(selected.id, { addressNote, shippingCost }); else await onStage(selected.id, "addressed", { addressNote, shippingCost }); setAction(null); toast.success(editingAction ? "Konum ve kargo bilgisi güncellendi" : "Konum ve kargo bilgisi kaydedildi"); })}/>
    <DeliveryModal open={action === "delivery"} order={selected} store={store} submitting={submitting} onClose={closeAction} onConfirm={() => selected && run(async () => { await onComplete(selected.id); setAction(null); setFilter("completed"); toast.success("Sipariş tamamlandı; gelir ve kargo finansa aktarıldı"); })}/>
    <CancelModal open={action === "cancel"} order={selected} store={store} submitting={submitting} onClose={closeAction} onConfirm={(charge, note) => selected && run(async () => { await onCancel(selected.id, charge, note); setAction(null); setFilter("cancelled"); toast.success("Sipariş iptal edildi"); })}/>
  </>;
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Clock3; color: string }) {
  return <div className="panel flex items-center gap-3 rounded-2xl p-4"><span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${color}16`, color }}><Icon size={16}/></span><div><p className="text-[9px] text-[#707b85]">{label}</p><p className="mt-0.5 text-[18px] font-semibold">{value}</p></div></div>;
}

function OrderCard({ order, store, submitting, onAdvance, onCancel }: { order: Order; store: Store; submitting: boolean; onAdvance: (stage: Exclude<OrderStage, "new">) => void; onCancel: () => void }) {
  const currentIndex = stageOrder.indexOf(order.stage);
  const progress = order.status === "cancelled" ? 0 : (currentIndex / (stageOrder.length - 1)) * 100;
  return <article className="rounded-2xl border border-[#27313a] bg-[#10161c] p-4">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1a2828] text-[#6bd9cc]"><UserRound size={16}/></span><div className="min-w-0"><p className="truncate text-[11px] font-semibold">{order.customerName}</p><p className="mt-1 truncate text-[9px] text-[#78838d]">{order.product}</p><p className="mt-1.5 flex items-center gap-1 text-[7px] text-[#59656f]"><CalendarDays size={9}/>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(order.createdAt))}</p></div></div><div className="text-right"><p className="text-[12px] font-bold text-[#e7ecef]">{money(order.amount, store.currency)}</p><StatusBadge status={order.status}/></div></div>
    <div className="my-4 h-1 overflow-hidden rounded-full bg-[#222b33]"><div className={`h-full rounded-full ${order.status === "cancelled" ? "bg-[#ff7468]" : "bg-[#2dd4bf]"}`} style={{ width: `${progress}%` }}/></div>
    <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map(({ stage, title, description, icon: Icon }, index) => {
        const stepIndex = index + 1;
        const done = order.status === "completed" || (order.status !== "cancelled" && currentIndex >= stepIndex);
        const next = order.status === "active" && currentIndex + 1 === stepIndex;
        const editable = order.status !== "cancelled" && done && (stage === "responded" || stage === "addressed");
        return <button key={stage} disabled={(!next && !editable) || submitting} onClick={() => onAdvance(stage)} title={editable ? `${title} bilgilerini düzenle` : undefined} className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${done ? `border-[#24423d] bg-[#14231f] ${editable ? "hover:border-[#4a8178] hover:bg-[#172a25]" : "cursor-default"}` : next ? "border-[#3a625d] bg-[#14201f] hover:border-[#55a99f]" : "cursor-not-allowed border-[#242d35] bg-[#0d1318] opacity-55"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${done ? "bg-[#245048] text-[#75e0d2]" : next ? "bg-[#233937] text-[#72dace]" : "bg-[#202830] text-[#68737e]"}`}>{done ? <Check size={13}/> : <Icon size={13}/>}</span><span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold">{title}</span><span className="mt-0.5 block truncate text-[7px] text-[#707b85]">{description}</span></span>{editable && <Pencil size={11} className="shrink-0 text-[#5e9e94]"/>}</button>;
      })}
    </div>
    {(order.responseNote || order.addressNote || order.shippingCost) && <div className="mt-3 rounded-xl bg-[#0b1116] p-3 text-[8px] leading-4 text-[#7d8993]">{order.responseNote && <p><span className="text-[#a9b2b9]">Geri dönüş:</span> {order.responseNote}</p>}{order.addressNote && <p><span className="text-[#a9b2b9]">Konum:</span> {order.addressNote}</p>}{Boolean(order.shippingCost) && <p><span className="text-[#a9b2b9]">Kargo:</span> {money(order.shippingCost ?? 0, store.currency)}</p>}</div>}
    {order.status === "active" && <div className="mt-3 flex justify-end"><button onClick={onCancel} className="text-[8px] font-semibold text-[#b36f6b] hover:text-[#ff8177]">Siparişi iptal et</button></div>}
    {order.status === "cancelled" && <div className="mt-3 rounded-xl border border-[#422725] bg-[#271817] p-3 text-[8px] text-[#c9908b]"><p>İptal edildi{order.cancelledShippingCharged ? " · Kargo giderlere işlendi" : " · Kargo gideri işlenmedi"}</p>{order.cancellationNote && <p className="mt-1 text-[#92716e]">{order.cancellationNote}</p>}</div>}
  </article>;
}

function StatusBadge({ status }: { status: Order["status"] }) { const config = status === "active" ? ["Devam ediyor", "bg-[#182a34] text-[#67bde8]"] : status === "completed" ? ["Tamamlandı", "bg-[#17302b] text-[#68ddcd]"] : ["İptal edildi", "bg-[#351f1e] text-[#ff887d]"]; return <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[7px] font-bold ${config[1]}`}>{config[0]}</span>; }

function NewOrderModal({ open, store, submitting, onClose, onSubmit }: { open: boolean; store: Store; submitting: boolean; onClose: () => void; onSubmit: (data: Pick<Order, "storeId" | "customerName" | "product" | "amount">) => void }) { return <Modal open={open} onClose={onClose} title="Yeni sipariş" description="Müşteri ve sipariş bilgilerini girin; takip akışı otomatik oluşturulsun."><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSubmit({ storeId: store.id, customerName: String(data.get("customerName")).trim(), product: String(data.get("product")).trim(), amount: Number(data.get("amount")) }); }}><Field label="Kişi adı"><input required disabled={submitting} name="customerName" className="input" placeholder="Örn. Aylin Məmmədova"/></Field><Field label="Verdiği sipariş"><textarea required disabled={submitting} name="product" className="input min-h-20 resize-none" placeholder="Ürün, adet, renk veya diğer detaylar..."/></Field><Field label={`Sipariş tutarı (${store.currency})`}><input required disabled={submitting} min="0.01" step="0.01" type="number" name="amount" className="input" placeholder="0,00"/></Field><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Oluşturuluyor…" : "Siparişi oluştur"}</button></form></Modal>; }

function ResponseModal({ open, editing, initialNote, submitting, onClose, onSubmit }: { open: boolean; editing: boolean; initialNote: string; submitting: boolean; onClose: () => void; onSubmit: (note: string) => void }) { return <Modal open={open} onClose={onClose} title={editing ? "Geri dönüşü düzenle" : "Müşteri geri dönüşü"} description="Gelen cevabı veya önemli detayları siparişe not edin."><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit(String(new FormData(event.currentTarget).get("note") || "").trim()); }}><Field label="Geri dönüş notu (isteğe bağlı)"><textarea autoFocus disabled={submitting} name="note" defaultValue={initialNote} className="input min-h-28 resize-none" placeholder="Müşterinin cevabı, talebi veya konuşma özeti..."/></Field><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{editing ? "Değişiklikleri kaydet" : "Aşamayı tamamla"}</button></form></Modal>; }

function AddressModal({ open, editing, initialAddress, initialShipping, store, submitting, onClose, onSubmit }: { open: boolean; editing: boolean; initialAddress: string; initialShipping: number; store: Store; submitting: boolean; onClose: () => void; onSubmit: (note: string, shipping: number) => void }) { return <Modal open={open} onClose={onClose} title={editing ? "Konum ve kargoyu düzenle" : "Konum ve kargo"} description="Teslimat bilgisini ve bu siparişe ait kargo giderini kaydedin."><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSubmit(String(data.get("addressNote")).trim(), Number(data.get("shippingCost"))); }}><Field label="Konum / adres notu"><textarea required disabled={submitting} name="addressNote" defaultValue={initialAddress} className="input min-h-20 resize-none" placeholder="Şehir, bölge veya teslimat notu..."/></Field><Field label={`Kargo gideri (${store.currency})`}><input required disabled={submitting} min="0" step="0.01" type="number" name="shippingCost" defaultValue={initialShipping} className="input" placeholder="0,00"/></Field><p className="rounded-xl bg-[#14201f] p-3 text-[8px] leading-4 text-[#82aaa5]">{editing && initialShipping > 0 ? "Sipariş teslim edildiyse değişen kargo tutarı finans kayıtlarında da otomatik güncellenir." : "Bu gider henüz finansa eklenmez. Sipariş teslim edilince veya iptal sırasında siz onaylarsanız giderlere yansır."}</p><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{editing ? "Değişiklikleri kaydet" : "Konum aşamasını tamamla"}</button></form></Modal>; }

function DeliveryModal({ open, order, store, submitting, onClose, onConfirm }: { open: boolean; order: Order | null; store: Store; submitting: boolean; onClose: () => void; onConfirm: () => void }) { return <Modal open={open} onClose={onClose} title="Teslimatı onayla" description="Bu işlem siparişi kapatır ve finans kayıtlarını oluşturur.">{order && <div className="space-y-4"><div className="rounded-xl border border-[#28343b] bg-[#0c1217] p-4"><p className="text-[10px] font-semibold">{order.customerName} — {order.product}</p><div className="mt-3 flex justify-between text-[9px]"><span className="text-[#77838d]">Gelire eklenecek</span><span className="font-bold text-[#68ddcd]">+{money(order.amount, store.currency)}</span></div><div className="mt-2 flex justify-between text-[9px]"><span className="text-[#77838d]">Gidere eklenecek kargo</span><span className="font-bold text-[#ff887d]">-{money(order.shippingCost ?? 0, store.currency)}</span></div></div><button disabled={submitting} onClick={onConfirm} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Finansa aktarılıyor…" : "Teslim edildi, finansa aktar"}</button></div>}</Modal>; }

function CancelModal({ open, order, store, submitting, onClose, onConfirm }: { open: boolean; order: Order | null; store: Store; submitting: boolean; onClose: () => void; onConfirm: (charge: boolean, note: string) => void }) { const [charge, setCharge] = useState(false); return <Modal open={open} onClose={onClose} title="Siparişi iptal et" description="Sipariş gelire yansımaz. Oluşan kargo masrafını giderlere ekleyebilirsiniz.">{order && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onConfirm(charge, String(new FormData(event.currentTarget).get("note") || "").trim()); }}><div className={`rounded-xl border p-3 ${order.shippingCost ? "border-[#493431] bg-[#251a19]" : "border-[#29323a] bg-[#10161b]"}`}><div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold">Kargo masrafı giderlere girsin mi?</p><p className="mt-1 text-[8px] text-[#827974]">Kayıtlı kargo: {money(order.shippingCost ?? 0, store.currency)}</p></div><button type="button" disabled={!order.shippingCost} onClick={() => setCharge(!charge)} className={`relative h-6 w-11 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${charge ? "bg-[#f07268]" : "bg-[#303943]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${charge ? "left-6" : "left-1"}`}/></button></div></div><Field label="İptal notu (isteğe bağlı)"><textarea disabled={submitting} name="note" className="input min-h-20 resize-none" placeholder="Müşteri reddetti, ulaşılamadı..."/></Field><button disabled={submitting} className="w-full rounded-xl bg-[#e8665d] py-3 text-[10px] font-bold text-white disabled:opacity-60">{submitting ? "İptal ediliyor…" : "Siparişi iptal et"}</button></form>}</Modal>; }
