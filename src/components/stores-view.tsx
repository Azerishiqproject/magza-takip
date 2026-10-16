"use client";

import { useRef, useState } from "react";
import { Folder, FolderPlus, Pencil, Plus, Power, Store as StoreIcon, Trash2 } from "lucide-react";
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
  const groups = [...folders.slice().sort((a, b) => a.name.localeCompare(b.name, "tr")), { id: "", name: "Klasörsüz mağazalar" }];
  const counts = (id: string) => ({ products: products.filter((item) => item.storeId === id).length, orders: orders.filter((item) => item.storeId === id).length, transactions: transactions.filter((item) => item.storeId === id).length, categories: categories.filter((item) => item.storeId === id).length });
  const deletingCounts = deletingStore ? counts(deletingStore.id) : null;
  const hasRecords = Boolean(deletingCounts && (deletingCounts.orders || deletingCounts.transactions || deletingCounts.categories || deletingCounts.products));

  return <>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-[20px] font-semibold tracking-[-.03em]">Mağazalar ve klasörler</h2><p className="mt-1 text-[10px] text-[#77818b]">Mağazaları istediğiniz klasörlerde toplayın, düzenleyin veya kullanmadıklarınızı silin.</p></div>
      <div className="flex gap-2"><button disabled={submitting} onClick={() => setFolderEditor("new")} className="flex items-center gap-2 rounded-xl border border-[#303840] px-3.5 py-2 text-[10px] font-semibold disabled:opacity-50"><FolderPlus size={14}/>Yeni klasör</button><button onClick={onAdd} disabled={submitting} className="flex items-center gap-2 rounded-xl bg-[#2dd4bf] px-3.5 py-2 text-[10px] font-bold text-[#07110f] disabled:opacity-50"><Plus size={14}/>Mağaza oluştur</button></div>
    </div>
    <StoresAnalytics orders={orders} stores={stores} folders={folders} categories={categories} transactions={transactions}/>
    <h3 className="mb-4 text-[14px] font-semibold">Mağaza yönetimi</h3>
    <div className="space-y-6">
      {groups.map((group) => {
        const members = stores.filter((store) => group.id ? store.folderId === group.id : !store.folderId || !folders.some((folder) => folder.id === store.folderId));
        return <section key={group.id}>
          <div className="mb-3 flex items-center gap-2 text-[#9ba7b0]"><Folder size={16} className="text-[#f4b860]"/><h3 className="text-[12px] font-semibold">{group.name}</h3><span className="text-[10px] text-[#68737d]">{members.length} mağaza</span>{group.id && <div className="ml-auto flex gap-2"><button disabled={submitting} onClick={() => setFolderEditor(group)} aria-label={`${group.name} klasörünü yeniden adlandır`} className="rounded-lg border border-[#29333c] p-2 disabled:opacity-50"><Pencil size={12}/></button><button disabled={submitting} onClick={() => setDeletingFolder(group)} aria-label={`${group.name} klasörünü sil`} className="rounded-lg border border-[#29333c] p-2 text-[#ff887d] disabled:opacity-50"><Trash2 size={12}/></button></div>}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{members.map((store) => {
            const data = transactions.filter((item) => item.storeId === store.id);
            const net = data.reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
            const storeCounts = counts(store.id);
            return <article key={store.id} className="panel rounded-2xl p-4">
              <button onClick={() => onSelect(store.id)} disabled={submitting} className="w-full text-left disabled:opacity-60">
                <div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${store.color}1c`, color: store.color }}><StoreIcon size={18}/></span><span className={`text-[8px] font-semibold ${store.status === "active" ? "text-[#6ddccc]" : "text-[#f4b860]"}`}>{store.status === "active" ? "AKTİF" : "DURAKLATILDI"}</span></div>
                <p className="mt-4 text-[12px] font-semibold">{store.name}</p><p className="mt-1 break-all text-[9px] text-[#68737d]">{store.domain}</p><p className="mt-3 text-[9px] text-[#89959f]">{storeCounts.orders} sipariş · {storeCounts.transactions} işlem</p>
                <div className="mt-4 border-t border-[#252d35] pt-3"><p className="text-[8px] uppercase tracking-[.12em] text-[#626d77]">Toplam net sonuç</p><p className={`mt-1.5 text-[16px] font-semibold ${net >= 0 ? "text-[#69dccc]" : "text-[#ff8177]"}`}>{money(net, store.currency)}</p></div>
              </button>
              <div className="mt-4"><Field label="Klasör"><select aria-label={`${store.name} mağazasının klasörü`} className="input" disabled={submitting} value={folders.some((folder) => folder.id === store.folderId) ? store.folderId! : ""} onChange={(event) => void run(() => onUpdate(store.id, { folderId: event.target.value || null }), "Mağaza klasörü güncellendi")}><option value="">Klasörsüz</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></Field></div>
              <div className="mt-3 flex flex-wrap justify-between gap-3"><button disabled={submitting} onClick={() => setEditingStore(store)} className="flex items-center gap-1.5 text-[10px] text-[#8ccfc5] disabled:opacity-50"><Pencil size={12}/>Düzenle</button><button disabled={submitting} aria-label={`${store.name} mağazasını ${store.status === "active" ? "duraklat" : "yeniden aç"}`} onClick={() => void run(() => onUpdate(store.id, { status: store.status === "active" ? "paused" : "active" }), store.status === "active" ? "Mağaza duraklatıldı" : "Mağaza yeniden açıldı")} className="flex items-center gap-1.5 text-[10px] text-[#f4b860] disabled:opacity-50"><Power size={12}/>{store.status === "active" ? "Duraklat" : "Yeniden aç"}</button><button disabled={submitting} onClick={() => { setDeletingStore(store); setConfirmation(""); }} aria-label={`${store.name} mağazasını sil`} className="flex items-center gap-1.5 text-[10px] text-[#ff887d] disabled:opacity-50"><Trash2 size={12}/>Sil</button></div>
            </article>;
          })}</div>
          {!members.length && <div className="rounded-xl border border-dashed border-[#303840] p-6 text-center text-[10px] text-[#77818b]">{group.id ? "Bu klasör boş. Mağaza kartındaki klasör seçimini kullanarak buraya taşıyabilirsiniz." : "Klasörsüz mağaza yok."}</div>}
        </section>;
      })}
    </div>
    {folderEditor && <Modal open onClose={close} title={folderEditor === "new" ? "Yeni klasör" : "Klasörü yeniden adlandır"} description="Örneğin: Türkiye mağazaları, Azerbaycan mağazaları."><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? ""); void run(() => onSaveFolder(name, folderEditor === "new" ? undefined : folderEditor.id), "Klasör kaydedildi", () => setFolderEditor(null)); }}><Field label="Klasör adı"><input autoFocus required name="name" disabled={submitting} defaultValue={folderEditor === "new" ? "" : folderEditor.name} className="input" maxLength={80}/></Field><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Kaydediliyor…" : "Kaydet"}</button></form></Modal>}
    <Modal open={Boolean(deletingFolder)} onClose={close} title="Klasörü sil" description={`“${deletingFolder?.name ?? ""}” klasörü silinecek. İçindeki mağazalar ve kayıtları korunarak Klasörsüz grubuna taşınacak.`}><div className="flex gap-2"><button disabled={submitting} onClick={close} className="flex-1 rounded-xl border border-[#303840] py-3 text-[10px]">Vazgeç</button><button disabled={submitting} onClick={() => deletingFolder && void run(() => onDeleteFolder(deletingFolder.id), "Klasör silindi; mağazalar klasörsüz gruba taşındı", () => setDeletingFolder(null))} className="flex-1 rounded-xl bg-[#ff7468] py-3 text-[10px] font-bold text-[#220b09] disabled:opacity-60">{submitting ? "Siliniyor…" : "Klasörü sil"}</button></div></Modal>
    {editingStore && <Modal open onClose={close} title="Mağazayı düzenle" description="Mağaza bilgilerini ve çalışma durumunu güncelleyin."><form className="space-y-4" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void run(() => onUpdate(editingStore.id, { name: String(data.get("name")), domain: String(data.get("domain")), color: String(data.get("color")), status: String(data.get("status")) as Store["status"], folderId: String(data.get("folderId") ?? "") || null }), "Mağaza güncellendi", () => setEditingStore(null));
    }}><Field label="Mağaza adı"><input autoFocus required name="name" defaultValue={editingStore.name} disabled={submitting} className="input"/></Field><Field label="Mağaza domaini"><input required name="domain" defaultValue={editingStore.domain} disabled={submitting} className="input"/></Field><Field label="Klasör"><select name="folderId" defaultValue={editingStore.folderId ?? ""} disabled={submitting} className="input"><option value="">Klasörsüz</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></Field><div className="grid grid-cols-[1fr_70px] gap-3"><Field label="Durum"><select name="status" defaultValue={editingStore.status} disabled={submitting} className="input"><option value="active">Aktif</option><option value="paused">Duraklatıldı</option></select></Field><Field label="Renk"><input type="color" name="color" defaultValue={editingStore.color} disabled={submitting} className="input h-[39px] p-1.5"/></Field></div><button disabled={submitting} className="w-full rounded-xl bg-[#2dd4bf] py-3 text-[10px] font-bold text-[#07110f] disabled:opacity-60">{submitting ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></form></Modal>}
    <Modal open={Boolean(deletingStore)} onClose={close} title="Mağazayı sil" description="Mağaza ve ona ait tüm ürünler, siparişler, finans işlemleri ve kategoriler kalıcı olarak silinir. Bu işlem geri alınamaz.">
      <p className="mb-4 text-[11px] text-[#c4cdd4]">{deletingStore?.name}: {deletingCounts?.orders ?? 0} sipariş, {deletingCounts?.transactions ?? 0} işlem, {deletingCounts?.categories ?? 0} kategori, {deletingCounts?.products ?? 0} ürün.</p>
      {hasRecords && <div className="mb-4"><Field label={`Onaylamak için “${deletingStore?.name}” yazın`}><input autoFocus disabled={submitting} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="input"/></Field></div>}
      <div className="flex gap-2"><button disabled={submitting} onClick={close} className="flex-1 rounded-xl border border-[#303840] py-3 text-[10px]">Vazgeç</button><button disabled={submitting || (hasRecords && confirmation !== deletingStore?.name)} onClick={() => deletingStore && void run(() => onDelete(deletingStore.id), "Mağaza ve bağlı kayıtları silindi", () => { setDeletingStore(null); setConfirmation(""); })} className="flex-1 rounded-xl bg-[#ff7468] py-3 text-[10px] font-bold text-[#220b09] disabled:opacity-60">{submitting ? "Siliniyor…" : "Mağazayı sil"}</button></div>
    </Modal>
  </>;
}
