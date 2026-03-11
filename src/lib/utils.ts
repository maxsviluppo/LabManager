import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDate(dateString: string) {
  if (!dateString) return "N/D";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Data non valida";
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch (e) {
    return "Data non valida";
  }
}
