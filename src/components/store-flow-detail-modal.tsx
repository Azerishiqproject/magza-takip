"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { reportMoney, type CurrencyReport } from "@/lib/store-analytics";
import type { Category, Store, TransactionType } from "@/lib/types";
import { Modal } from "./modal";

type Props = {
  point: CurrencyReport["timeline"][number];
  type: TransactionType;
  granularity: CurrencyReport["granularity"];
  currency: Store["currency"];
  storeCount: number;
  stores: Store[];
  categories: Category[];
  onClose: () => void;
};

export function StoreFlowDetailModal({ point, type, granularity, currency, storeCount, stores, categories, onClose }: Props) {
  const summary = useRef<HTMLDivElement>(null);
  const items = point.transactions.filter((item) => item.type === type).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category]));
  const income = type === "income";
  const title = income ? "Gelir detayları" : "Gider detayları";
  const dateLabel = granularity === "year" ? point.id : format(new Date(`${point.id}${granularity === "month" ? "-01" : ""}T12:00:00`), granularity === "month" ? "MMMM yyyy" : "d MMMM yyyy", { locale: tr });

  useEffect(() => {
    const previousFocus = document.activeElement;
    summary.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const dialog = summary.current?.closest('[role="dialog"]');
        const controls = dialog?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
        const first = controls?.[0]; const last = controls?.[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === summary.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === summary.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const originLabel = `${point.id} ${type === "income" ? "gelir" : "gider"} detaylarını aç`;
      const origin = [...document.querySelectorAll<SVGElement>('g[role="button"]')].find((node) => node.getAttribute("aria-label") === originLabel);
      const target = origin ?? previousFocus;
      if ((target instanceof HTMLElement || target instanceof SVGElement) && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [onClose, point.id, type]);

  return <Modal open size="wide" title={`${dateLabel} · ${title}`} description={`${storeCount} seçili mağaza · ${items.length} kayıt · ${currency}`} onClose={onClose}>
    <div ref={summary} tabIndex={-1} className={`mb-4 rounded-xl border p-4 outline-none ${income ? "border-[#28564a] bg-[#12251e]" : "border-[#59332f] bg-[#281b1a]"}`}>
      <p className="text-xs text-[#a4b1ba]">{income ? "Toplam gelir" : "Toplam gider"}</p>
      <p className={`mt-2 text-2xl font-semibold ${income ? "text-[#68ddcd]" : "text-[#ff9b92]"}`}>{reportMoney(point[type], currency)}</p>
      <p className="mt-2 text-xs leading-5 text-[#929da8]">Grafikteki bu noktaya dahil edilen kayıtlar. Seçili mağaza, dönem, kategori ve para birimi filtreleri uygulanır.</p>
    </div>
    {items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs">
      <caption className="sr-only">{dateLabel} {income ? "gelir" : "gider"} kayıtları</caption>
      <thead className="text-[#929da8]"><tr className="border-b border-[#29333c]">{["Tarih", "Mağaza", "İşlem / açıklama", "Kategori", "Tutar"].map((label) => <th key={label} scope="col" className={`pb-3 pr-3 font-medium ${label === "Tutar" ? "text-right" : ""}`}>{label}</th>)}</tr></thead>
      <tbody>{items.map((item) => {
        const category = categoryNames.get(item.categoryId);
        return <tr key={item.id} className="border-b border-[#242d35] last:border-0">
          <td className="whitespace-nowrap py-3 pr-3 text-[#a7b2bc]">{format(new Date(`${item.date}T12:00:00`), "dd.MM.yyyy")}</td>
          <td className="py-3 pr-3 font-medium text-[#c8d5de]">{storeNames.get(item.storeId) ?? "Mağaza"}</td>
          <td className="max-w-[280px] break-words py-3 pr-3"><p className="text-[#dbe3e9]">{item.title || "İşlem"}</p>{item.note && <p className="mt-1 leading-5 text-[#929da8]">{item.note}</p>}</td>
          <td className="py-3 pr-3 text-[#a7b2bc]">{category?.storeId === item.storeId ? category.name : "Kategorisiz"}</td>
          <td className={`whitespace-nowrap py-3 pr-3 text-right font-semibold ${income ? "text-[#68ddcd]" : "text-[#ff9b92]"}`}>{reportMoney(item.amount, currency)}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="py-10 text-center text-sm text-[#929da8]">Bu noktada {income ? "gelir" : "gider"} kaydı bulunmuyor.</p>}
  </Modal>;
}
