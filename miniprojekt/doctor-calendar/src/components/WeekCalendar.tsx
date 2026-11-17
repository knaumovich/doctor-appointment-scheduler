import { useEffect, useMemo, useRef, useState } from "react";
import type { Appointment, AvailabilityRule, Absence } from "../lib/types";
import { addDays, clamp, minutesSinceMidnight, sameDay, startOfWeekMonday } from "../lib/time";
import { isoDate, isDateInRange } from "../lib/date";
import { generateFreeSlotsForDay, subtractBookedSlots } from "../lib/availability";
import { DayHeader } from "./DayHeader";
import { EventBlock } from "./EventBlock";
import { ReservationForm } from "./ReservationForm";
import { CancelReservationModal } from "./CancelReservationModal";

const SLOT_MIN = 30;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MIN;
const HEADER_H = 44;
const ROW_H = 48;

function toDate(iso: string) {
  return new Date(iso);
}

function isPast(appt: Appointment, now: Date) {
  return toDate(appt.end).getTime() < now.getTime();
}

function countBookedForDay(appts: Appointment[], day: Date) {
  return appts.filter((a) => a.status === "BOOKED" && sameDay(toDate(a.start), day)).length;
}

function initialAnchorForDoctor(appointments: Appointment[], doctorId: string) {
  const relevant = appointments
    .filter((a) => a.doctorId === doctorId)
    .map((a) => new Date(a.start))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return relevant[0] ?? new Date();
}

export function WeekCalendar({
  doctorId,
  appointments,
  availabilityRules,
  absences,
  viewMode,
  anchorDate,
  onAnchorDateChange,
  onBookAppointment,
  currentUserId,
  currentUserEmail,
  patientBookedIds,
  onCancelBookedAppointment,
}: {
  doctorId: string;
  appointments: Appointment[];
  availabilityRules: AvailabilityRule[];
  absences: Absence[];
  viewMode: "DOCTOR" | "PATIENT";
  anchorDate?: Date;
  onAnchorDateChange?: (d: Date) => void;

  // Zadanie 4
  onBookAppointment?: (appt: Appointment) => Promise<void>;
  currentUserId?: string;
  currentUserEmail?: string | null;

  // Zadanie 6
  patientBookedIds?: string[]; // ids rezerwacji wykonanych w tym przeglądarce (localStorage)
  onCancelBookedAppointment?: (appointmentId: string, reason: string) => Promise<void>;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [internalAnchor, setInternalAnchor] = useState<Date>(() =>
    initialAnchorForDoctor(appointments, doctorId)
  );

  const anchor = anchorDate ?? internalAnchor;
  const setAnchor = (d: Date) => {
    onAnchorDateChange?.(d);
    if (!anchorDate) setInternalAnchor(d);
  };

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const weekStart = useMemo(() => startOfWeekMonday(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const slotStarts = useMemo(() => Array.from({ length: SLOTS_PER_DAY }, (_, i) => i * SLOT_MIN), []);
  const today = new Date();

  const appts = useMemo(
    () => appointments.filter((a) => a.doctorId === doctorId),
    [appointments, doctorId]
  );

  const patientBookedSet = useMemo(() => new Set(patientBookedIds ?? []), [patientBookedIds]);

  // absencje dzień->bool
  const absentDayMap = useMemo(() => {
    const m = new Map<string, boolean>();
    const relevant = absences.filter((a) => a.doctorId === doctorId);
    for (const d of days) {
      const dIso = isoDate(d);
      const isAbsent = relevant.some((a) => isDateInRange(dIso, a.fromDate, a.toDate));
      m.set(dIso, isAbsent);
    }
    return m;
  }, [absences, days, doctorId]);

  // dostępność (dla DOCTOR i PATIENT – w PATIENT pokazujemy wolne terminy)
  const availabilityMap = useMemo(() => {
    const m = new Map<string, Set<number>>();

    for (const d of days) {
      const dIso = isoDate(d);
      if (absentDayMap.get(dIso)) {
        m.set(dIso, new Set());
        continue;
      }

      const dayAppts = appts.filter((a) => sameDay(toDate(a.start), d));
      const free = generateFreeSlotsForDay(d, availabilityRules, doctorId);
      const freeMinusBooked = subtractBookedSlots(free, dayAppts);

      const set = new Set<number>();
      for (const s of freeMinusBooked) set.add(minutesSinceMidnight(s.start));
      m.set(dIso, set);
    }

    return m;
  }, [absentDayMap, appts, availabilityRules, days, doctorId]);

  function scrollToMinute(min: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const row = Math.floor(min / SLOT_MIN);
    const y = HEADER_H + row * ROW_H;
    el.scrollTop = clamp(y - 16, 0, el.scrollHeight);
  }

  const positioned = useMemo(() => {
    return appts
      .filter(a => a.status !== "CANCELED")
      .map((a) => {
        const s = toDate(a.start);
        const e = toDate(a.end);
        const dayIndex = days.findIndex((d) => sameDay(d, s));
        if (dayIndex < 0) return null;

        const startMin = clamp(minutesSinceMidnight(s), 0, 24 * 60);
        const endMin = clamp(minutesSinceMidnight(e), 0, 24 * 60);
        if (endMin <= startMin) return null;

        const rowStart = Math.floor(startMin / SLOT_MIN) + 2;
        const rowEnd = Math.ceil(endMin / SLOT_MIN) + 2;

        return {
          appt: a,
          col: dayIndex + 2,
          rowStart,
          rowSpan: Math.max(1, rowEnd - rowStart),
          past: isPast(a, now),
        };
      })
      .filter(Boolean) as Array<{ appt: Appointment; col: number; rowStart: number; rowSpan: number; past: boolean }>;
  }, [appts, days, now]);

  const nowMarker = useMemo(() => {
    const dayIndex = days.findIndex((d) => sameDay(d, now));
    if (dayIndex < 0) return null;
    const mins = minutesSinceMidnight(now);
    const offsetSlots = mins / SLOT_MIN;
    return { col: dayIndex + 2, topPct: (offsetSlots / SLOTS_PER_DAY) * 100 };
  }, [days, now]);

  const absentHeaderBg = viewMode === "PATIENT" ? "#ffd6d6" : "#fff0f0";
  const absentCellBg = viewMode === "PATIENT" ? "#ffe5e5" : "#fff6f6";
  const availabilityBg = "#eefbf1";

  // Zadanie 4: rezerwacja
  const [bookingMode, setBookingMode] = useState(false);
  const [draft, setDraft] = useState<null | {
    dayIso: string;
    day: Date;
    startMin: number;
    maxSlots: number;
    conflictHint?: string;
  }>(null);


  function hhmm(min: number) {
    const h = String(Math.floor(min / 60)).padStart(2, "0");
    const m = String(min % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  function dateAtMinute(day: Date, min: number) {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(min);
    return d;
  }

  // Zadanie 6: anulowanie
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelAppt, setCancelAppt] = useState<Appointment | null>(null);

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          rowGap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
          maxWidth: "100%",
        }}
      >
        <button onClick={() => setAnchor(addDays(anchor, -7))}>← Previous Week</button>
        <button onClick={() => setAnchor(new Date())}>Today</button>
        <button onClick={() => setAnchor(addDays(anchor, 7))}>Next Week →</button>

        <div style={{ flex: 1 }} />

        {viewMode === "PATIENT" && (
          <button
            type="button"
            onClick={() => setBookingMode((p) => !p)}
            style={{ fontWeight: bookingMode ? 900 : 500 }}
          >
            {bookingMode ? "✓ Book Appointment" : "Book Appointment"}
          </button>
        )}

        <button type="button" onClick={() => scrollToMinute(8 * 60)}>08:00</button>
        <button type="button" onClick={() => scrollToMinute(12 * 60)}>12:00</button>
        <button type="button" onClick={() => scrollToMinute(16 * 60)}>16:00</button>
        <button type="button" onClick={() => scrollToMinute(20 * 60)}>20:00</button>
      </div>

      <div
        ref={scrollerRef}
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          overflow: "auto",
          maxHeight: "calc(100vh - 170px)",
          background: "white",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "90px repeat(7, minmax(170px, 1fr))",
            gridTemplateRows: `${HEADER_H}px repeat(${SLOTS_PER_DAY}, ${ROW_H}px)`,
            minWidth: 90 + 7 * 170,
          }}
        >
          <div
            style={{
              gridColumn: 1,
              gridRow: 1,
              borderRight: "1px solid #eee",
              background: "#fafafa",
              position: "sticky",
              top: 0,
              left: 0,
              zIndex: 50,
            }}
          />

          {days.map((d, i) => {
            const dIso = isoDate(d);
            const absent = absentDayMap.get(dIso) === true;
            const isTod = sameDay(d, today);
            const bg = absent ? absentHeaderBg : isTod ? "#eef6ff" : "#fafafa";

            return (
              <div
                key={dIso}
                style={{
                  gridColumn: i + 2,
                  gridRow: 1,
                  borderRight: i === 6 ? "none" : "1px solid #eee",
                  background: bg,
                  position: "sticky",
                  top: 0,
                  zIndex: 40,
                }}
              >
                <DayHeader date={d} bookedCount={countBookedForDay(appts, d)} isToday={isTod} />
                {absent && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#8a0000",
                      background: "rgba(255,255,255,0.7)",
                      padding: "2px 6px",
                      borderRadius: 999,
                      border: "1px solid rgba(138,0,0,0.25)",
                    }}
                  >
                    ABSENT
                  </div>
                )}
              </div>
            );
          })}

          {slotStarts.map((min, idx) => {
            const h = String(Math.floor(min / 60)).padStart(2, "0");
            const m = String(min % 60).padStart(2, "0");
            const showLabel = m === "00" || idx === 0;

            return (
              <div
                key={min}
                style={{
                  gridColumn: 1,
                  gridRow: idx + 2,
                  borderTop: "1px solid #eee",
                  borderRight: "1px solid #eee",
                  background: "#fff",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 6,
                  color: "#444",
                  position: "sticky",
                  left: 0,
                  zIndex: 30,
                }}
              >
                {showLabel ? `${h}:${m}` : ""}
              </div>
            );
          })}

          {days.map((d, i) => {
            const dIso = isoDate(d);
            const absent = absentDayMap.get(dIso) === true;
            const isTod = sameDay(d, today);
            const available = availabilityMap.get(dIso) ?? new Set<number>();

            return slotStarts.map((min, r) => {
              let bg = "#fff";
              if (absent) bg = absentCellBg;
              else if (available.has(min)) bg = availabilityBg;
              else if (isTod) bg = "#f6fbff";

              const cellStart = dateAtMinute(d, min);
              const isPastCell = cellStart.getTime() < now.getTime();

              const canPick =
                viewMode === "PATIENT" &&
                bookingMode &&
                !absent &&
                available.has(min) &&
                !isPastCell;

              const isSelected = draft && draft.dayIso === dIso && draft.startMin === min;

              return (
                <div
                  key={`${dIso}-${min}`}
                  style={{
                    gridColumn: i + 2,
                    gridRow: r + 2,
                    borderTop: "1px solid #eee",
                    borderRight: i === 6 ? "none" : "1px solid #eee",
                    background: bg,
                    cursor: canPick ? "pointer" : "default",
                    outline: isSelected ? "2px solid #111" : "none",
                    outlineOffset: -2,
                    opacity: canPick ? 1 : isPastCell && available.has(min) ? 0.55 : 1,
                  }}
                  onClick={() => {
                    if (!canPick) return;

                    let maxSlots = 0;
                    for (let m = min; available.has(m); m += SLOT_MIN) maxSlots += 1;

                    const maxDuration = maxSlots * SLOT_MIN;
                    const allowedEndMin = min + maxDuration;

                    const nextBookedStartMin = appts
                      .filter((a) => a.status === "BOOKED" && sameDay(toDate(a.start), d))
                      .map((a) => minutesSinceMidnight(toDate(a.start)))
                      .filter((m) => m > min)
                      .sort((a, b) => a - b)[0];

                    const hint =
                      typeof nextBookedStartMin === "number" && nextBookedStartMin === allowedEndMin
                        ? `The next appointment starts at ${hhmm(nextBookedStartMin)}.`
                        : `Availability ends at ${hhmm(allowedEndMin)}.`;

                    setDraft({ dayIso: dIso, day: d, startMin: min, maxSlots, conflictHint: hint });
                  }}
                />
              );
            });
          })}

          {positioned.map((p) => {
            const isPatientOwned =
              viewMode === "PATIENT" &&
              p.appt.status === "BOOKED" &&
              patientBookedSet.has(p.appt.id);

            return (
              <EventBlock
                key={p.appt.id}
                appt={p.appt}
                past={p.past}
                clickable={isPatientOwned}
                onClick={(appt) => {
                  if (!isPatientOwned) return;
                  if (!onCancelBookedAppointment) return;
                  if (p.past) return;

                  setCancelAppt(appt);
                  setCancelOpen(true);
                }}
                style={{
                  gridColumn: p.col,
                  gridRow: `${p.rowStart} / span ${p.rowSpan}`,
                  zIndex: 20,
                }}
              />
            );
          })}

          {nowMarker && (
            <div
              style={{
                gridColumn: nowMarker.col,
                gridRow: `2 / span ${SLOTS_PER_DAY}`,
                position: "relative",
                zIndex: 60,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${nowMarker.topPct}%`,
                  height: 2,
                  background: "red",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {viewMode === "PATIENT" && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              background: availabilityBg,
              border: "1px solid #ddd",
              borderRadius: 4,
              marginRight: 6,
              verticalAlign: "middle",
            }}
          />
          available time slots{" "}
          {bookingMode && (
            <span style={{ marginLeft: 10, color: "#2b2b2b" }}>
              (click a green time slot to book)
            </span>
          )}
          <div style={{ marginTop: 6, color: "#555" }}>
            To cancel, click your booked appointment (a colored block).
          </div>
        </div>
      )}

      {draft && viewMode === "PATIENT" && (
        <ReservationForm
          dayLabel={draft.dayIso}
          startMin={draft.startMin}
          maxSlots={draft.maxSlots}
          conflictHint={draft.conflictHint}
          onCancel={() => setDraft(null)}
          onSubmit={async (p) => {
            if (!onBookAppointment) {
              alert("Booking is not available in this view.");
              return;
            }

            const start = dateAtMinute(draft.day, draft.startMin);
            const end = new Date(start.getTime() + p.durationMin * 60 * 1000);

            const id = crypto.randomUUID
              ? crypto.randomUUID()
              : String(Date.now() + Math.random());

            const patientId = crypto.randomUUID
              ? crypto.randomUUID()
              : `p-${Date.now()}-${Math.random()}`;

            const appt: Appointment = {
              id,
              doctorId,
              start: start.toISOString(),
              end: end.toISOString(),
              type: p.type,
              status: "BOOKED",
              patient: {
                id: patientId,
                name: p.patientName,
                age: p.patientAge,
                gender: p.patientGender,
              },
              patientUserId: currentUserId,
              patientEmail: currentUserEmail ?? null,
              documents: p.documents,
              notes: p.notes,
            };

            await onBookAppointment(appt);
            setDraft(null);
          }}
        />
      )}

      <CancelReservationModal
        key={cancelAppt?.id ?? "closed"}
        open={cancelOpen}
        appt={cancelAppt}
        onClose={() => {
          setCancelOpen(false);
          setCancelAppt(null);
        }}
        onConfirm={async (reason) => {
          if (!cancelAppt || !onCancelBookedAppointment) return;
          await onCancelBookedAppointment(cancelAppt.id, reason);
          setCancelOpen(false);
          setCancelAppt(null);
        }}
      />
    </div>
  );
}
