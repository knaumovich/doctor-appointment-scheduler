function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Local YYYY-MM-DD (bez pułapek stref czasowych związanych z toISOString()).
 */
export function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function datesBetween(from: string, to: string): string[] {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const out: string[] = [];
  for (let d = new Date(a); d.getTime() <= b.getTime(); d.setDate(d.getDate() + 1)) {
    out.push(isoDate(d));
  }
  return out;
}

export function isDateInRange(dIso: string, from: string, to: string) {
  return from <= dIso && dIso <= to;
}
