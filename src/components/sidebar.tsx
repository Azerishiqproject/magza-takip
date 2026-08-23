"use client";

import { BarChart3, ChevronLeft, LayoutDashboard, Menu, ReceiptText, Settings, Shapes, Store, X } from "lucide-react";

export type View = "overview" | "transactions" | "categories" | "stores";

const items = [
  { id: "overview" as const, label: "Genel bakış", icon: LayoutDashboard },
  { id: "transactions" as const, label: "İşlemler", icon: ReceiptText },
  { id: "categories" as const, label: "Kategoriler", icon: Shapes },
  { id: "stores" as const, label: "Mağazalar", icon: Store },
];

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return <button className="rounded-lg border border-[#27303a] p-2 text-[#a4adb7] lg:hidden" onClick={onClick}><Menu size={17} /></button>;
}

export function Sidebar({ view, setView, open, onClose }: { view: View; setView: (view: View) => void; open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <button aria-label="Menüyü kapat" onClick={onClose} className="fixed inset-0 z-30 bg-black/60 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-[#202831] bg-[#0d1217] transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[68px] items-center justify-between border-b border-[#202831] px-5">
          <button onClick={() => setView("overview")} className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#2dd4bf] text-[12px] font-extrabold text-[#07100f]">M</span>
            <span className="text-[14px] font-bold tracking-[.16em]">MITHRA</span>
          </button>
          <button onClick={onClose} className="text-[#89939f] lg:hidden"><X size={17} /></button>
        </div>
        <nav className="flex-1 p-3">
          <p className="mb-2 px-3 pt-3 text-[9px] font-bold uppercase tracking-[.18em] text-[#56616c]">Yönetim</p>
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setView(id); onClose(); }} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] font-medium transition ${view === id ? "bg-[#172822] text-[#68e1d1]" : "text-[#8d97a2] hover:bg-white/[.035] hover:text-white"}`}>
              <Icon size={15} strokeWidth={1.8} />{label}
              {id === "overview" && view === id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#2dd4bf]" />}
            </button>
          ))}
          <p className="mb-2 mt-7 px-3 text-[9px] font-bold uppercase tracking-[.18em] text-[#56616c]">Raporlama</p>
          <button onClick={() => setView("overview")} className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[11px] font-medium text-[#8d97a2] hover:bg-white/[.035] hover:text-white"><BarChart3 size={15} />Finans raporu</button>
        </nav>
        <div className="border-t border-[#202831] p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] text-[#77818c] hover:text-white"><Settings size={15} />Ayarlar <ChevronLeft size={12} className="ml-auto rotate-180" /></button>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-[#121920] p-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#26323b] text-[10px] font-bold text-[#bfc8cf]">MA</div>
            <div className="min-w-0"><p className="truncate text-[10px] font-semibold">Mithra Admin</p><p className="truncate text-[9px] text-[#65717c]">Yönetici hesap</p></div>
          </div>
        </div>
      </aside>
    </>
  );
}
