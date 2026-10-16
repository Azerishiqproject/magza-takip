"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Folder, Search } from "lucide-react";
import type { Store, StoreFolder } from "@/lib/types";

type Props = {
  stores: Store[];
  folders: StoreFolder[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function ReportStoreSelect({ stores, folders, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const selected = new Set(selectedIds);
  const chosen = stores.filter((store) => selected.has(store.id));
  const allSelected = stores.length > 0 && chosen.length === stores.length;
  const label = !chosen.length ? "Mağaza seçin" : allSelected ? "Tüm mağazalar" : chosen.length === 1 ? chosen[0].name : `${chosen.length} mağaza seçili`;
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const folderIds = new Set(folders.map((folder) => folder.id));
  const groups = [...folders.slice().sort((a, b) => a.name.localeCompare(b.name, "tr")), { id: "", name: "Klasörsüz mağazalar" }].map((group) => ({
    ...group,
    stores: stores.filter((store) => (group.id ? store.folderId === group.id : !store.folderId || !folderIds.has(store.folderId)) && `${store.name} ${store.domain} ${group.name}`.toLocaleLowerCase("tr-TR").includes(query)),
  })).filter((group) => group.stores.length > 0);

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const toggle = (ids: string[]) => {
    const next = new Set(selectedIds);
    const remove = ids.every((id) => next.has(id));
    ids.forEach((id) => remove ? next.delete(id) : next.add(id));
    onChange([...next]);
  };

  return <div ref={root} className="relative min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }} onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-[#7f8994]">Mağazalar / klasörler</span>
    <button ref={trigger} type="button" aria-label="Rapor mağazaları" aria-describedby={`${panelId}-selection`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} title={chosen.map((store) => store.name).join(", ")} disabled={!stores.length} onClick={() => { setSearch(""); setOpen(!open); }} className="input flex min-h-11 items-center gap-2 text-left disabled:opacity-50">
      <span id={`${panelId}-selection`} className="min-w-0 flex-1 truncate">{stores.length ? label : "Mağaza yok"}</span><ChevronDown size={15} className={`shrink-0 text-[#929da8] transition-transform ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && <div id={panelId} role="dialog" aria-label="Rapora dahil edilecek mağazalar" style={{ background: "#111820" }} className="panel absolute left-0 z-30 mt-2 w-[min(380px,calc(100vw-64px))] overflow-hidden rounded-xl shadow-2xl">
      <div className="border-b border-[#29333c] p-3">
        <p className="mb-3 text-xs font-medium text-[#c5d0d9]">Bir veya birkaç mağaza seçin</p>
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-[#8c99a5]"/><input ref={searchInput} aria-label="Rapor mağazalarında ara" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mağaza veya klasör ara..." className="input !pl-9 text-xs"/></div>
        <div className="mt-2 flex flex-wrap justify-between gap-2"><button type="button" onClick={() => onChange(stores.map((store) => store.id))} className="min-h-9 rounded-lg px-2 text-xs text-[#79dfd2] hover:bg-white/5">Tüm mağazaları seç</button><button type="button" onClick={() => onChange([])} className="min-h-9 rounded-lg px-2 text-xs text-[#a2aeb9] hover:bg-white/5">Seçimi temizle</button></div>
      </div>
      <div className="max-h-[40dvh] overflow-y-auto p-2">{groups.map((group) => {
        const count = group.stores.filter((store) => selected.has(store.id)).length;
        const partial = count > 0 && count < group.stores.length;
        return <div key={group.id} className="mb-2 last:mb-0">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white/[.03] px-2.5 py-2 text-xs font-medium text-[#c2cdd5]">
            <input type="checkbox" aria-label={`${group.name} grubundaki mağazaları seç`} checked={count === group.stores.length} aria-checked={partial ? "mixed" : count === group.stores.length} ref={(element) => { if (element) element.indeterminate = partial; }} onChange={() => toggle(group.stores.map((store) => store.id))} className="h-4 w-4 shrink-0 accent-[#2dd4bf] [color-scheme:dark]"/>
            <Folder size={14} className="shrink-0 text-[#e6b875]"/><span className="min-w-0 flex-1 break-words">{group.name}</span><span className="shrink-0 text-[11px] text-[#8e9ca6]">{count}/{group.stores.length}</span>
          </label>
          {group.stores.map((store) => <label key={store.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg py-2 pl-5 pr-2.5 text-xs hover:bg-white/[.04]">
            <input type="checkbox" aria-label={`${store.name} rapora dahil`} checked={selected.has(store.id)} onChange={() => toggle([store.id])} className="h-4 w-4 shrink-0 accent-[#2dd4bf] [color-scheme:dark]"/>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: store.color }}/><span className="min-w-0 flex-1 break-words text-[#cbd5dc]">{store.name}</span><span className="shrink-0 text-[10px] text-[#929da8]">{store.status === "paused" ? "Duraklatıldı" : store.currency}</span>
          </label>)}
        </div>;
      })}{!groups.length && <p className="px-3 py-6 text-center text-xs text-[#929da8]">Aramanıza uygun mağaza bulunamadı.</p>}</div>
      <div className="flex items-center justify-between gap-2 border-t border-[#29333c] p-3"><span className="text-xs text-[#a3b0ba]" aria-live="polite">{chosen.length} mağaza seçili</span><button type="button" onClick={close} className="min-h-10 rounded-lg bg-[#2dd4bf] px-5 text-xs font-semibold text-[#07110f]">Tamam</button></div>
    </div>}
  </div>;
}
