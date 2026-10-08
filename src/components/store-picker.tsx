"use client";

import { ChevronDown, Folder, FolderCog, Plus } from "lucide-react";
import type { Store, StoreFolder } from "@/lib/types";

export function StorePicker({ stores, folders, activeStore, open, onToggle, onClose, onSelect, onAdd, onManage }: { stores: Store[]; folders: StoreFolder[]; activeStore?: Store; open: boolean; onToggle: () => void; onClose: () => void; onSelect: (id: string) => void; onAdd: () => void; onManage: () => void }) {
  const groups = [...folders.slice().sort((a, b) => a.name.localeCompare(b.name, "tr")), { id: "", name: "Klasörsüz" }];
  return <div className="relative">
    <button onClick={onToggle} aria-expanded={open} aria-label="Mağaza seç" className="flex w-[160px] items-center gap-2 rounded-xl border border-[#28313a] bg-[#11171d] px-3 py-2 text-left hover:border-[#3a474f] sm:w-[200px]">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: activeStore?.color ?? "#2dd4bf" }}/><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold">{activeStore?.name ?? "Mağaza seçin"}</span><span className="block truncate text-[8px] text-[#65717c]">{activeStore?.domain ?? "Yeni mağaza oluşturun"}</span></span><ChevronDown size={13} className="shrink-0 text-[#6e7882]"/>
    </button>
    {open && <><button tabIndex={-1} aria-label="Mağaza menüsünü kapat" onClick={onClose} className="fixed inset-0 z-20 cursor-default"/><div className="panel absolute right-0 z-30 mt-2 w-[min(300px,calc(100vw-32px))] rounded-xl p-2 shadow-2xl" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="max-h-[55dvh] overflow-y-auto">{groups.map((group) => {
        const members = stores.filter((store) => group.id ? store.folderId === group.id : !store.folderId || !folders.some((folder) => folder.id === store.folderId));
        if (!group.id && !members.length) return null;
        return <details key={group.id} open className="mb-1"><summary className="cursor-pointer rounded-lg px-2 py-2 text-[10px] font-semibold text-[#a9b3bc]"><span className="ml-1 inline-flex items-center gap-2"><Folder size={12} className="text-[#f4b860]"/>{group.name}<span className="text-[9px] text-[#68737d]">({members.length})</span></span></summary>{members.map((store) => <button key={store.id} onClick={() => onSelect(store.id)} className="flex w-full items-center gap-2.5 rounded-lg py-2 pr-2 pl-6 text-left hover:bg-white/[.04]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: store.color }}/><span className="min-w-0 flex-1 truncate text-[10px]">{store.name}</span>{store.status === "paused" && <span className="text-[8px] text-[#f4b860]">Duraklatıldı</span>}{store.id === activeStore?.id && <span className="text-[9px] text-[#2dd4bf]">Seçili</span>}</button>)}{!members.length && <p className="py-2 pl-6 text-[9px] text-[#68737d]">Klasör boş</p>}</details>;
      })}{!stores.length && <p className="p-3 text-[10px] text-[#89939f]">Henüz mağaza yok.</p>}</div>
      <div className="mt-2 space-y-1 border-t border-[#29313a] pt-2"><button onClick={onManage} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] text-[#a9b3bc] hover:bg-white/[.04]"><FolderCog size={13}/>Mağazaları ve klasörleri yönet</button><button onClick={onAdd} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[10px] text-[#69d8ca] hover:bg-white/[.04]"><Plus size={13}/>Yeni mağaza</button></div>
    </div></>}
  </div>;
}
