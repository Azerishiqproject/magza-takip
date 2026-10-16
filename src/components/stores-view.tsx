"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, BarChart3, Folder, FolderPlus, Pencil, Plus, Search, Settings2, Store as StoreIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";
import type { Category, Order, Product, Store, StoreFolder, Transaction } from "@/lib/types";
import { StoresAnalytics } from "./stores-analytics";
import { Field, Modal } from "./modal";

type Result = { persisted: boolean };
type Props = {
  stores: Store[];
  products: Product[];
  folders: StoreFolder[];
  transactions: Transaction[];
  orders: Order[];
  categories: Category[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, changes: Partial<Omit<Store, "id">>) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  onSaveFolder: (name: string, id?: string) => Promise<Result>;
  onDeleteFolder: (id: string) => Promise<Result>;
};

export function StoresView({ stores, products, folders, transactions, orders, categories, onSelect, onAdd, onUpdate, onDelete, onSaveFolder, onDeleteFolder }: Props) {
  const [page, setPage] = useState<"reports" | "manage">(stores.length ? "reports" : "manage");
  const [search, setSearch] = useState("");
  const [folderEditor, setFolderEditor] = useState<StoreFolder | "new" | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<StoreFolder | null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  const close = () => { if (!lock.current) { setFolderEditor(null); setDeletingFolder(null); setEditingStore(null); setDeletingStore(null); setConfirmation(""); } };
  const run = async (action: () => Promise<Result>, message: string, after?: () => void) => {
    if (lock.current) return;
    lock.current = true; setSubmitting(true);
    try {
      const result = await action();
      if (result.persisted) toast.success(message);
      else toast.info(`${message} (demo modu; değişiklikler bu oturumda geçerli).`);
      after?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : "İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin."); }
    finally { lock.current = false; setSubmitting(false); }
  };
  const visibleStores = stores.filter((store) => `${store.name} ${store.domain}`.toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR")));
  const groups = [...folders.slice().sort((a, b) => a.name.localeCompare(b.name, "tr")), { id: "", name: "Klasörsüz mağazalar" }];
  const counts = (id: string) => ({ products: products.filter((item) => item.storeId === id).length, orders: orders.filter((item) => item.storeId === id).length, transactions: transactions.filter((item) => item.storeId === id).length, categories: categories.filter((item) => item.storeId === id).length });
  const deletingCounts = deletingStore ? counts(deletingStore.id) : null;
  const hasRecords = Boolean(deletingCounts && (deletingCounts.orders || deletingCounts.transactions || deletingCounts.categories || deletingCounts.products));

  return <>
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight">Mağazalar</h2>
      <p className="mt-1.5 text-sm text-[#929da8]">Satışları takip edin, mağazalarınızı yönetin.</p>
    </div>
    <div role="group" aria-label="Mağazalar görünümü" className="mb-6 flex w-fit max-w-full gap-1 rounded-xl border border-[#29333c] bg-[#0d1319] p-1">
      <button type="button" aria-pressed={page === "reports"} onClick={() => setPage("reports")} className={`flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${page === "reports" ? "bg-[#24332f] text-[#8be4d7]" : "text-[#9ca8b4] hover:text-white"}`}><BarChart3 size={16}/>Raporlar</button>
      <button type="button" aria-pressed={page === "manage"} onClick={() => setPage("manage")} className={`flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${page === "manage" ? "bg-[#24332f] text-[#8be4d7]" : "text-[#9ca8b4] hover:text-white"}`}><StoreIcon size={16}/>Mağazalarım<span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px]">{stores.length}</span></button>
    </div>
    <div hidden={page !== "reports"}>
      <StoresAnalytics visible={page === "reports"} orders={orders} stores={stores} folders={folders} categories={categories} transactions={transactions}/>
    </div>
    <section hidden={page !== "manage"} aria-label="Mağaza yönetimi">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[#8c99a5]"/><input aria-label="Mağaza ara" placeholder="Mağaza ara..." value={search} onChange={(event) => setSearch(event.target.value)} className="input !pl-10"/></div>
        <div className="flex flex-wrap gap-2"><button disabled={submitting} onClick={() => setFolderEditor("new")} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#303840] px-4 text-xs font-medium disabled:opacity-50"><FolderPlus size={16}/>Yeni klasör</button><button onClick={onAdd} disabled={submitting} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#2dd4bf] px-4 text-xs font-semibold text-[#07110f] disabled:opacity-50"><Plus size={16}/>Mağaza oluştur</button></div>
      </div>
      <div className="space-y-6">
      {groups.map((group) => {
        const members = visibleStores.filter((store) => group.id ? store.folderId === group.id : !store.folderId || !folders.some((folder) => folder.id === store.folderId));
        if (search.trim() && !members.length) return null;
        if (!group.id && !members.length && folders.length) return null;
        return <section key={group.id}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[#9ba7b0]"><Folder size={16} className="text-[#f4b860]"/><h3 className="min-w-0 break-words text-sm font-semibold">{group.name}</h3><span className="text-xs text-[#929da8]">{members.length} mağaza</span>{group.id && <div className="ml-auto flex shrink-0 gap-2"><button disabled={submitting} onClick={() => setFolderEditor(group)} aria-label={`${group.name} klasörünü yeniden adlandır`} className="rounded-lg border border-[#29333c] p-2 disabled:opacity-50"><Pencil size={12}/></button><button disabled={submitting} onClick={() => setDeletingFolder(group)} aria-label={`${group.name} klasörünü sil`} className="rounded-lg border border-[#29333c] p-2 text-[#ff887d] disabled:opacity-50"><Trash2 size={12}/></button></div>}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{members.map((store) => {
            const data = transactions.filter((item) => item.storeId === store.id);
            const net = data.reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
            const storeCounts = counts(store.id);
            return <article key={store.id} className="panel rounded-2xl p-4">
              <div>
                <div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${store.color}1c`, color: store.color }}><StoreIcon size={18}/></span><span className={`text-[11px] font-semibold ${store.status === "active" ? "text-[#6ddccc]" : "text-[#f4b860]"}`}>{store.status === "active" ? "AKTİF" : "DURAKLATILDI"}</span></div>
                <p className="mt-4 break-words text-sm font-semibold">{store.name}</p><p className="mt-1 break-all text-xs text-[#929da8]">{store.domain}</p><p className="mt-3 text-xs text-[#89959f]">{storeCounts.orders} sipariş · {storeCounts.transactions} işlem</p>
                <div className="mt-4 border-t border-[#252d35] pt-3"><p className="text-[11px] uppercase tracking-[.12em] text-[#929da8]">Toplam net sonuç</p><p className={`mt-1.5 break-words text-xl font-semibold ${net >= 0 ? "text-[#69dccc]" : "text-[#ff8177]"}`}>{money(net, store.currency)}</p></div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#29333c] pt-3"><button disabled={submitting} onClick={() => onSelect(store.id)} aria-label={`${store.name} mağazasını aç`} className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs text-[#83dbcb] hover:bg-white/5 disabled:opacity-50">Mağazayı aç<ArrowUpRight size={14}/></button><button disabled={submitting} aria-label={`${store.name} mağazasını yönet`} onClick={() => setEditingStore(store)} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#303840] px-3 text-xs text-[#b1bec8] hover:bg-white/5 disabled:opacity-50"><Settings2 size={14}/>Yönet</button></div>
            </article>;
          })}</div>
          {!members.length && <div className="rounded-xl border border-dashed border-[#303840] p-6 text-center text-xs text-[#77818b]">{group.id ? "Bu klasör boş. Mağazanın Yönet ekranından buraya taşıyabilirsiniz." : "Henüz mağaza yok. Başlamak için Mağaza oluştur düğmesini kullanın."}</div>}
        </section>;
      })}
      </div>
      {search.trim() && !visibleStores.length && <p className="py-12 text-center text-sm text-[#929da8]">Aramanıza uygun mağaza bulunamadı.</p>}
    </section>
    {folderEditor && <Modal open onClose={close} title={folderEditor === "new" ? "Yeni klasör" : "Klasörü yeniden adlandır"} description="Örneğin: Türkiye mağazaları, Azerbaycan mağazaları."><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? ""); void run(() => onSaveFolder(name, folderEditor === "new" ? undefined : folderEditor.id), "Klasör kaydedildi", () => setFolderEditor(null)); }}><Field label="Klasör adı"><input autoFocus required name="name" disabled={submitting} defaultValue={folderEditor === "new" ? "" : folderEditor.name} className="input" maxLength={80}/></Field><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-xs font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Kaydediliyor…" : "Kaydet"}</button></form></Modal>}
    <Modal open={Boolean(deletingFolder)} onClose={close} title="Klasörü sil" description={`“${deletingFolder?.name ?? ""}” klasörü silinecek. İçindeki mağazalar ve kayıtları korunarak Klasörsüz grubuna taşınacak.`}><div className="flex gap-2"><button disabled={submitting} onClick={close} className="flex-1 rounded-xl border border-[#303840] py-3 text-xs">Vazgeç</button><button disabled={submitting} onClick={() => deletingFolder && void run(() => onDeleteFolder(deletingFolder.id), "Klasör silindi; mağazalar klasörsüz gruba taşındı", () => setDeletingFolder(null))} className="flex-1 rounded-xl bg-[#ff7468] py-3 text-xs font-bold text-[#220b09] disabled:opacity-60">{submitting ? "Siliniyor…" : "Klasörü sil"}</button></div></Modal>
    {editingStore && <Modal open onClose={close} title="Mağazayı düzenle" description="Mağaza bilgilerini ve çalışma durumunu güncelleyin."><form className="space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void run(() => onUpdate(editingStore.id, { name: String(data.get("name")), domain: String(data.get("domain")), color: String(data.get("color")), status: String(data.get("status")) as Store["status"], folderId: String(data.get("folderId") ?? "") || null }), "Mağaza güncellendi", () => setEditingStore(null));
    }}><Field label="Mağaza adı"><input autoFocus required name="name" defaultValue={editingStore.name} disabled={submitting} className="input"/></Field><Field label="Mağaza domaini"><input required name="domain" defaultValue={editingStore.domain} disabled={submitting} className="input"/></Field><Field label="Klasör"><select aria-label="Klasör" name="folderId" defaultValue={editingStore.folderId ?? ""} disabled={submitting} className="input"><option value="">Klasörsüz</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></Field><div className="grid grid-cols-[1fr_70px] gap-3"><Field label="Durum"><select aria-label="Durum" name="status" defaultValue={editingStore.status} disabled={submitting} className="input"><option value="active">Aktif</option><option value="paused">Duraklatıldı</option></select></Field><Field label="Renk"><input type="color" name="color" defaultValue={editingStore.color} disabled={submitting} className="input h-[39px] p-1.5"/></Field></div><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-xs font-semibold text-[#07110f] disabled:opacity-60">{submitting ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></form><div className="mt-5 border-t border-[#29333c] pt-3"><button type="button" disabled={submitting} onClick={() => { setDeletingStore(editingStore); setEditingStore(null); setConfirmation(""); }} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-[#ff9b92] hover:bg-[#ff887d]/5 disabled:opacity-50"><Trash2 size={14}/>Mağazayı sil</button></div></Modal>}
    <Modal open={Boolean(deletingStore)} onClose={close} title="Mağazayı sil" description="Mağaza ve ona ait tüm ürünler, siparişler, finans işlemleri ve kategoriler kalıcı olarak silinir. Bu işlem geri alınamaz.">
      <p className="mb-4 text-[11px] text-[#c4cdd4]">{deletingStore?.name}: {deletingCounts?.orders ?? 0} sipariş, {deletingCounts?.transactions ?? 0} işlem, {deletingCounts?.categories ?? 0} kategori, {deletingCounts?.products ?? 0} ürün.</p>
      {hasRecords && <div className="mb-4"><Field label={`Onaylamak için “${deletingStore?.name}” yazın`}><input autoFocus disabled={submitting} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input"/></Field></div>}
      <div className="flex gap-2"><button disabled={submitting} onClick={close} className="flex-1 rounded-xl border border-[#303840] py-3 text-xs">Vazgeç</button><button disabled={submitting || (hasRecords && confirmation !== deletingStore?.name)} onClick={() => deletingStore && void run(() => onDelete(deletingStore.id), "Mağaza ve bağlı kayıtları silindi", () => { setDeletingStore(null); setConfirmation(""); })} className="flex-1 rounded-xl bg-[#ff7468] py-3 text-xs font-bold text-[#220b09] disabled:opacity-60">{submitting ? "Siliniyor…" : "Mağazayı sil"}</button></div>
    </Modal>
  </>;
}
