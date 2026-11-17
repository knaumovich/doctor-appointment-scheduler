import React, { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../lib/errors";
import type { ConsultType, PatientGender } from "../lib/types";

const SLOT_MIN = 30;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function hhmmFromMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function labelConsultType(t: ConsultType) {
  switch (t) {
    case "FIRST_VISIT":
      return "Initial Consultation";
    case "FOLLOW_UP":
      return "Follow-up";
    case "CHRONIC":
      return "Chronic Care";
    case "PRESCRIPTION":
      return "Prescription";
    case "ONLINE":
      return "Online";
    case "DOCUMENTS":
      return "Documents / Test Results";
    default:
      return t;
  }
}

export type ReservationFormPayload = {
  durationMin: number;
  type: ConsultType;
  patientName: string;
  patientGender: PatientGender;
  patientAge: number;
  notes: string;
  documents: string[];
};

export function ReservationForm({
  dayLabel,
  startMin,
  maxSlots,
  conflictHint,
  onCancel,
  onSubmit,
}: {
  dayLabel: string;
  startMin: number;
  maxSlots: number;
  conflictHint?: string;
  onCancel: () => void;
  onSubmit: (p: ReservationFormPayload) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 720);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const maxDuration = maxSlots * SLOT_MIN;

  const durationOptions = useMemo(() => {
    // pozwalamy wybrać dłużej niż dostępne, by pokazać konflikt
    const cap = Math.max(maxDuration + SLOT_MIN * 4, SLOT_MIN * 8);
    const hardCap = Math.min(cap, SLOT_MIN * 12); // max 6h
    const out: number[] = [];
    for (let m = SLOT_MIN; m <= hardCap; m += SLOT_MIN) out.push(m);
    return out;
  }, [maxDuration]);

  const [durationMin, setDurationMin] = useState<number>(SLOT_MIN);
  const [type, setType] = useState<ConsultType>("FOLLOW_UP");
  const [patientName, setPatientName] = useState("");
  const [patientGender, setPatientGender] = useState<PatientGender>("F");
  const [ageRaw, setAgeRaw] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState<string[]>([]);

  const patientAge = useMemo(() => {
    const n = Number(ageRaw);
    return Number.isFinite(n) ? n : NaN;
  }, [ageRaw]);

  const conflict = durationMin > maxDuration;

  const canSubmit =
    patientName.trim().length > 0 &&
    Number.isFinite(patientAge) &&
    Number.isInteger(patientAge) && patientAge > 0 && patientAge <= 130 && !busy &&
    durationMin % SLOT_MIN === 0 &&
    !conflict;

  const endMin = startMin + durationMin;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: 10,
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    fontSize: 12,
    minWidth: 0, // kluczowe, żeby grid nie wypychał poza okno
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          maxHeight: "calc(100vh - 32px)", // nie wychodzi poza okno
          background: "white",
          borderRadius: 16,
          border: "1px solid #ddd",
          boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* HEADER */}
        <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Book Appointment</div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
            {dayLabel} • {hhmmFromMin(startMin)}–{hhmmFromMin(endMin)}
          </div>
        </div>

        {/* BODY (scroll, jeśli mało miejsca) */}
        <div style={{ padding: 14, overflowY: "auto" }}>
          {error && <div role="alert" style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}
          {/* ROW: duration + type */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "minmax(0,1fr) minmax(0,1fr)",
              gap: 12,
              alignItems: "start",
              marginBottom: 12,
            }}
          >
            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>Appointment Duration</span>
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                style={inputStyle}
              >
                {durationOptions.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <span style={{ color: "#777" }}>
                Time available from the selected start: <b>{maxDuration} min</b>
              </span>
            </label>

            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>Appointment Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ConsultType)}
                style={inputStyle}
              >
                {(
                  ["FIRST_VISIT", "FOLLOW_UP", "CHRONIC", "PRESCRIPTION", "ONLINE", "DOCUMENTS"] as ConsultType[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {labelConsultType(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {conflict && (
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(138,0,0,0.25)",
                background: "#fff3f3",
                color: "#7a0000",
                fontSize: 12,
                lineHeight: 1.35,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Scheduling Conflict</div>
              <div>
                The selected duration exceeds the available time. All time slots must be
                consecutive. {conflictHint ?? ""}
              </div>
            </div>
          )}

          {/* ROW: name + gender + age */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow
                ? "1fr"
                : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)",
              gap: 12,
              alignItems: "start",
              marginBottom: 12,
            }}
          >
            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>Patient Name</span>
              <input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Alex Smith"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>Gender</span>
              <select
                value={patientGender}
                onChange={(e) => setPatientGender(e.target.value as PatientGender)}
                style={inputStyle}
              >
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </label>

            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>Age</span>
              <input
                type="number"
                min={1}
                max={130}
                step={1}
                value={ageRaw}
                onChange={(e) => setAgeRaw(e.target.value)}
                placeholder="e.g. 28"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={{ ...labelStyle, marginBottom: 12 }}>
            <span style={{ fontWeight: 800 }}>Notes for the Doctor</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={isNarrow ? 4 : 5}
              placeholder="Briefly describe the reason for your appointment"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>

          <label style={labelStyle}>
            <span style={{ fontWeight: 800 }}>Attach Documents (e.g. test results)</span>
            <input
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setDocuments(files.map((f) => f.name));
              }}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            <span style={{ color: "#777", wordBreak: "break-word" }}>
              {documents.length > 0 ? `Selected: ${documents.join(", ")}` : "No attachments"}
            </span>
          </label>
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: 14,
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap", // nie wypycha przycisków poza okno
          }}
        >
          <button type="button" disabled={busy} onClick={onCancel} style={{ padding: "8px 14px", borderRadius: 10 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit({
                durationMin,
                type,
                patientName,
                patientGender,
                patientAge: Number(patientAge),
                notes,
                documents,
                });
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
            disabled={!canSubmit}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              fontWeight: 900,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Booking…" : "Book Appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}
