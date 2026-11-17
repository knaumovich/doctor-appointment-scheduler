import type { AvailabilityRule, Appointment } from "./types";
import { isoDate } from "./date";

const SLOT_MIN = 30;

export function generateFreeSlotsForDay(date: Date, rules: AvailabilityRule[], doctorId: string) {
  const dIso = isoDate(date);
  const weekday = date.getDay() as 0|1|2|3|4|5|6;

  const active = rules.filter(r => {
    if (r.doctorId !== doctorId) return false;
    if (r.kind === "ONE_TIME") return r.date === dIso;
    return r.fromDate <= dIso && dIso <= r.toDate && r.daysMask.includes(weekday);
  });

  const slots: Array<{ start: Date; end: Date }> = [];

  for (const r of active) {
    for (const tr of r.ranges) {
      for (let m = tr.startMin; m + SLOT_MIN <= tr.endMin; m += SLOT_MIN) {
        const s = new Date(date);
        s.setHours(0, 0, 0, 0);
        s.setMinutes(m);
        const e = new Date(s.getTime() + SLOT_MIN * 60 * 1000);
        slots.push({ start: s, end: e });
      }
    }
  }

  // uniq po starcie
  const map = new Map<number, { start: Date; end: Date }>();
  for (const s of slots) map.set(s.start.getTime(), s);
  return Array.from(map.values()).sort((a,b) => a.start.getTime() - b.start.getTime());
}

export function subtractBookedSlots(freeSlots: Array<{start: Date; end: Date}>, booked: Appointment[]) {
  const bookedRanges = booked
    .filter(a => a.status === "BOOKED")
    .map(a => ({ start: new Date(a.start), end: new Date(a.end) }));

  return freeSlots.filter(slot =>
    !bookedRanges.some(b => slot.start < b.end && b.start < slot.end)
  );
}
