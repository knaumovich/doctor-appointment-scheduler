import { useMemo, useState } from "react";
import { errorMessage } from "../lib/errors";
import type { Appointment } from "../lib/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function durationMin(a: Appointment) {
  const s = new Date(a.start).getTime();
  const e = new Date(a.end).getTime();
  return Math.max(0, Math.round((e - s) / 60000));
}

export function CancelReservationModal({
  open,
  appt,
  onClose,
  onConfirm,
}: {
  open: boolean;
  appt: Appointment | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const title = useMemo(() => {
    if (!appt) return "";
    const d = durationMin(appt);
    return `${fmtDateTime(appt.start)} – ${fmtDateTime(appt.end)} • ${d} min`;
  }, [appt]);

  if (!open || !appt) return null;

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
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(640px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          background: "white",
          borderRadius: 16,
          border: "1px solid #ddd",
          boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Cancel Appointment</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
            Patient: <b>{appt.patient?.name ?? "—"}</b>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: "auto", display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.35 }}>
            Canceling this appointment makes its time slots available for booking again.
          </div>

          {error && <div role="alert" style={{ color: "#b00020" }}>{error}</div>}
          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            <span style={{ fontWeight: 800 }}>Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ddd",
                resize: "vertical",
              }}
            />
          </label>
        </div>

        <div
          style={{
            padding: 14,
            borderTop: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button type="button" disabled={busy} onClick={onClose} style={{ padding: "8px 14px", borderRadius: 10 }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try { await onConfirm(reason.trim()); }
              catch (error) { setError(errorMessage(error)); }
              finally { setBusy(false); }
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              fontWeight: 900,
            }}
          >
            Cancel Appointment
          </button>
        </div>
      </div>
    </div>
  );
}
