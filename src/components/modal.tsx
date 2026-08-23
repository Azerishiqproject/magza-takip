"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="panel w-full max-w-md rounded-2xl p-5" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 className="text-[15px] font-semibold">{title}</h2>{description && <p className="mt-1 text-[11px] leading-5 text-[#89939f]">{description}</p>}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#89939f] hover:bg-white/5 hover:text-white" aria-label="Kapat"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-[#7f8994]">{label}</span>{children}</label>;
}
