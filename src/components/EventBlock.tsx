import React, { useMemo, useState } from "react";
import type { Appointment } from "../lib/types";
import { Tooltip } from "./Tooltip";

const typeColor: Record<string, string> = {
  FIRST_VISIT: "#5b8cff",
  FOLLOW_UP: "#40c38a",
  CHRONIC: "#e84a9b",
  PRESCRIPTION: "#8a6b3c",
  ONLINE: "#ffb020",
  DOCUMENTS: "#b36bff",
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function labelType(t: string) {
  switch (t) {
    case "FIRST_VISIT": return "Initial Consultation";
    case "FOLLOW_UP": return "Follow-up";
    case "CHRONIC": return "Chronic Care";
    case "PRESCRIPTION": return "Prescription";
    case "ONLINE": return "Online";
    case "DOCUMENTS": return "Documents / Test Results";
    default: return t;
  }
}

export function EventBlock({
  appt,
  past,
  style,
  onClick,
  clickable,
}: {
  appt: Appointment;
  past: boolean;
  style: React.CSSProperties;
  onClick?: (appt: Appointment) => void;
  clickable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const bg = useMemo(() => {
    const base = typeColor[appt.type] ?? "#888";
    if (appt.status === "FREE") return "#e9eef5";
    if (appt.status === "CANCELED") return "#d6d6d6";
    return base;
  }, [appt.status, appt.type]);

  const text =
    appt.status === "FREE"
      ? "Available"
      : appt.status === "CANCELED"
      ? "Appointment canceled"
      : appt.patient?.name ?? "Booked";

  const fg = appt.status === "FREE" || appt.status === "CANCELED" ? "#2b2b2b" : "white";
  const canClick = !!onClick && !!clickable && !past;

  return (
    <div
      style={{
        ...style,
        margin: 4,
        borderRadius: 12,
        padding: 8,
        background: bg,
        color: fg,
        opacity: past ? 0.45 : 1,
        boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
        cursor: canClick ? "pointer" : "default",
        position: "relative",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => {
        if (!canClick) return;
        onClick(appt);
      }}
      title={canClick ? "Click to cancel this appointment" : undefined}
    >
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{labelType(appt.type)}</div>
      <div style={{ fontSize: 12 }}>
        <span style={appt.status === "CANCELED" ? { textDecoration: "line-through" } : undefined}>
          {text}
        </span>
      </div>

      {open && (
        <Tooltip>
          <div style={{ fontSize: 12, lineHeight: 1.35 }}>
            <div>
              <b>Time:</b> {fmtTime(appt.start)}–{fmtTime(appt.end)}
            </div>
            <div>
              <b>Status:</b> {{ FREE: "Available", BOOKED: "Booked", CANCELED: "Canceled" }[appt.status]}
            </div>
            <div>
              <b>Type:</b> {labelType(appt.type)}
            </div>
            {appt.status === "CANCELED" && (
              <div>
                <b>Reason:</b> {appt.cancelReason ?? "-"}
              </div>
            )}
            {canClick && (
              <div style={{ marginTop: 6, fontWeight: 800 }}>Click to cancel</div>
            )}
          </div>
        </Tooltip>
      )}
    </div>
  );
}
