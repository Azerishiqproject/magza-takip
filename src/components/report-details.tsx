import { ChevronDown, Table2 } from "lucide-react";
import type { ReactNode } from "react";

export function ReportDetails({ children }: { children: ReactNode }) {
  return <details className="group mt-5 border-t border-[#29333c]">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 text-xs font-medium text-[#aab7c2] transition hover:text-white [&::-webkit-details-marker]:hidden">
      <Table2 size={15}/>Ayrıntılı tablo<ChevronDown size={15} className="ml-auto transition-transform group-open:rotate-180"/>
    </summary>
    <div className="pb-2">{children}</div>
  </details>;
}
