import type { Store } from "./types";

export function money(value: number, currency: Store["currency"] = "TRY", compact = false) {
  if (compact) {
    const symbols: Record<Store["currency"], string> = { TRY: "₺", USD: "$", EUR: "€", AZN: "₼" };
    const absolute = Math.abs(value);
    const divisor = absolute >= 1_000_000 ? 1_000_000 : 1_000;
    const suffix = absolute >= 1_000_000 ? "Mn" : "B";
    const formatted = (absolute / divisor).toFixed(1).replace(".", ",");
    return `${value < 0 ? "−" : ""}${symbols[currency]}${formatted} ${suffix}`;
  }
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}
