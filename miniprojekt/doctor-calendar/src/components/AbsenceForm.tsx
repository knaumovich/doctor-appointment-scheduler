import { useState } from "react";
import type { Absence, Appointment } from "../lib/types";
import { errorMessage } from "../lib/errors";
import { datesBetween, isoDate } from "../lib/date";

function rangesOverlap(fromA: string, toA: string, fromB: string, toB: string) {
  // zakresy (inclusive) na stringach YYYY-MM-DD
  return !(toA < fromB || toB < fromA);
}

export function AbsenceForm({
  doctorId,
  appointments,
  onAddAbsence,
  onRemoveAbsence,
  existingAbsences,
  defaultFromDate,
  defaultToDate,
}: {
  doctorId: string;
  appointments: Appointment[];
  existingAbsences: Absence[];
  onAddAbsence: (a: Absence) => Promise<void>;
  onRemoveAbsence: (id: string) => Promise<void>;
  defaultFromDate?: string;
  defaultToDate?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(defaultFromDate ?? "2025-02-10");
  const [toDate, setToDate] = useState(defaultToDate ?? defaultFromDate ?? "2025-02-10");
  const [reason, setReason] = useState("Planned absence");

  async function submit() {
    if (!fromDate || !toDate) return alert("Enter the start and end dates.");
    if (fromDate > toDate) return alert("The start date cannot be after the end date.");

    // Nie pozwalamy dodawać nakładających się absencji dla tego samego lekarza
    const hasOverlap = existingAbsences.some((a) =>
      a.doctorId === doctorId && rangesOverlap(fromDate, toDate, a.fromDate, a.toDate)
    );
    if (hasOverlap) {
      return alert("These dates overlap an existing absence.");
    }

    // Konflikty z BOOKED
    const days = new Set(datesBetween(fromDate, toDate));
    const conflicts = appointments.filter(a =>
      a.doctorId === doctorId &&
      a.status === "BOOKED" &&
      days.has(isoDate(new Date(a.start)))
    );

    const absence: Absence = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      doctorId,
      fromDate,
      toDate,
      reason,
    };

    setBusy(true);
    setError(null);
    try {
      await onAddAbsence(absence);
      alert(conflicts.length ? `Conflicting appointments canceled: ${conflicts.length}.` : "Absence added. No scheduling conflicts.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, background: "white" }}>
      <h3 style={{ marginTop: 0 }}>All-day Absences</h3>
      {error && <div role="alert" style={{ color: "#b00020" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label>
          From:
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          To:
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: "100%" }} />
        </label>
      </div>

      <label style={{ display: "block", marginTop: 8 }}>
        Reason:
        <input value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%" }} />
      </label>

      <button disabled={busy} onClick={submit} style={{ width: "100%", padding: 10, marginTop: 10, fontWeight: 700 }}>
        Add Absence
      </button>

      <div style={{ marginTop: 12, fontSize: 13 }}>
        <b>Existing Absences:</b>
        {existingAbsences.length === 0 ? (
          <div style={{ color: "#666" }}>None.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {existingAbsences.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <div>
                  <div>
                    <b>{a.fromDate}</b> → <b>{a.toDate}</b>
                  </div>
                  <div style={{ color: "#555" }}>{a.reason ?? "-"}</div>
                </div>
                <button type="button" disabled={busy} onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try { await onRemoveAbsence(a.id); }
                  catch (error) { setError(errorMessage(error)); }
                  finally { setBusy(false); }
                }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
