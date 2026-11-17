import React, { useMemo, useState } from "react";
import { errorMessage } from "../lib/errors";
import type { AvailabilityRule, TimeRange, Weekday } from "../lib/types";

function hhmmToMin(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function minToHHMM(min: number) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const weekdayLabels: Array<{ d: Weekday; label: string }> = [
  { d: 1, label: "Mon" },
  { d: 2, label: "Tue" },
  { d: 3, label: "Wed" },
  { d: 4, label: "Thu" },
  { d: 5, label: "Fri" },
  { d: 6, label: "Sat" },
  { d: 0, label: "Sun" },
];

const weekdayLabelMap = new Map<Weekday, string>(weekdayLabels.map((x) => [x.d, x.label]));

function formatDaysMask(days: Weekday[]) {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => weekdayLabelMap.get(d) ?? String(d))
    .join(", ");
}

const timeSelectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 64,
  textAlign: "center",
  padding: "8px 10px",
  paddingRight: 15,
  fontVariantNumeric: "tabular-nums",
};

type Mode = "CYCLIC" | "ONE_TIME";

export function AvailabilityForm({
  doctorId,
  onAddRule,
  existingRules,
  onRemoveRule,
  onClearAll,
  defaultFromDate,
  defaultToDate,
  defaultOneDate,
}: {
  doctorId: string;
  onAddRule: (r: AvailabilityRule) => Promise<void>;
  existingRules: AvailabilityRule[];
  onRemoveRule: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  defaultFromDate?: string;
  defaultToDate?: string;
  defaultOneDate?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const [mode, setMode] = useState<Mode>("CYCLIC");

  // CYCLIC
  const [fromDate, setFromDate] = useState(defaultFromDate ?? "2025-02-01");
  const [toDate, setToDate] = useState(defaultToDate ?? "2025-03-12");
  const [daysMask, setDaysMask] = useState<Weekday[]>([1, 2, 4, 6]);

  // ONE_TIME
  const [oneDate, setOneDate] = useState(defaultOneDate ?? "2025-02-10");

  // Ranges common
  const [ranges, setRanges] = useState<Array<{ start: string; end: string }>>([
    { start: "08:00", end: "12:30" },
    { start: "16:00", end: "21:30" },
  ]);

  const parsedRanges: TimeRange[] = useMemo(() => {
    return ranges.map((r) => ({
      startMin: hhmmToMin(r.start),
      endMin: hhmmToMin(r.end),
    }));
  }, [ranges]);

  function toggleDay(d: Weekday) {
    setDaysMask((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function addRangeRow() {
    setRanges((prev) => [...prev, { start: "08:00", end: "08:30" }]);
  }

  function removeRangeRow(i: number) {
    setRanges((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRange(i: number, field: "start" | "end", value: string) {
    setRanges((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function validate(): string | null {
    if (parsedRanges.length === 0) return "Add at least one time range.";
    const sorted = [...parsedRanges].sort((a, b) => a.startMin - b.startMin);

    for (const tr of sorted) {
      if (!(tr.startMin < tr.endMin)) return "The start time must be before the end time.";
      if (tr.startMin < 0 || tr.endMin > 24 * 60) return "Time ranges must fall between 00:00 and 24:00.";
      if (tr.startMin % 30 !== 0 || tr.endMin % 30 !== 0) return "Times must use 30-minute intervals (e.g. 12:30).";
    }

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.endMin > cur.startMin) return "Time ranges cannot overlap.";
    }

    if (mode === "CYCLIC") {
      if (!fromDate || !toDate) return "Enter the start and end dates.";
      if (fromDate > toDate) return "The start date cannot be after the end date.";
      if (daysMask.length === 0) return "Select at least one weekday.";
    } else {
      if (!oneDate) return "Select a date.";
    }

    return null;
  }

  function submit() {
    const err = validate();
    if (err) return alert(err);

    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

    const rule: AvailabilityRule =
      mode === "CYCLIC"
        ? {
            id,
            doctorId,
            kind: "CYCLIC",
            fromDate,
            toDate,
            daysMask: [...daysMask].sort((a, b) => a - b),
            ranges: parsedRanges,
          }
        : {
            id,
            doctorId,
            kind: "ONE_TIME",
            date: oneDate,
            ranges: parsedRanges,
          };

    void run(() => onAddRule(rule));
  }

  return (
    <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, background: "white" }}>
      <h3 style={{ marginTop: 0 }}>Set Availability</h3>
      {error && <div role="alert" style={{ color: "#b00020" }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" checked={mode === "CYCLIC"} onChange={() => setMode("CYCLIC")} />
          Recurring
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" checked={mode === "ONE_TIME"} onChange={() => setMode("ONE_TIME")} />
          One-time
        </label>
      </div>

      {mode === "CYCLIC" ? (
        <>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
            <label>
              From:
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: "100%" }} />
            </label>
            <label>
              To:
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: "100%" }} />
            </label>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Appointment Days:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {weekdayLabels.map(({ d, label }) => (
                <label key={d} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={daysMask.includes(d)} onChange={() => toggleDay(d)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <label>
            Date:
            <input type="date" value={oneDate} onChange={(e) => setOneDate(e.target.value)} style={{ width: "100%" }} />
          </label>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Appointment Hours (add one or more time ranges):</div>

        <div style={{ display: "grid", gap: 8 }}>
          {ranges.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <label>
                From:
                <div style={{ display: "grid", gridTemplateColumns: "minmax(64px,1fr) auto minmax(64px,1fr)", gap: 6, alignItems: "center" }}>
                  <select
                    value={r.start.split(":")[0]}
                    onChange={(e) => updateRange(i, "start", `${e.target.value}:${r.start.split(":")[1]}`)}
                    style={timeSelectStyle}
                  >
                    {Array.from({ length: 24 }, (_, h) => {
                      const val = String(h).padStart(2, "0");
                      return (
                        <option key={val} value={val}>
                          {val}
                        </option>
                      );
                    })}
                  </select>
                  <span>:</span>
                  <select
                    value={r.start.split(":")[1]}
                    onChange={(e) => updateRange(i, "start", `${r.start.split(":")[0]}:${e.target.value}`)}
                    style={timeSelectStyle}
                  >
                    {["00", "30"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                To:
                <div style={{ display: "grid", gridTemplateColumns: "minmax(64px,1fr) auto minmax(64px,1fr)", gap: 6, alignItems: "center" }}>
                  <select
                    value={r.end.split(":")[0]}
                    onChange={(e) => updateRange(i, "end", `${e.target.value}:${r.end.split(":")[1]}`)}
                    style={timeSelectStyle}
                  >
                    {Array.from({ length: 24 }, (_, h) => {
                      const val = String(h).padStart(2, "0");
                      return (
                        <option key={val} value={val}>
                          {val}
                        </option>
                      );
                    })}
                  </select>
                  <span>:</span>
                  <select
                    value={r.end.split(":")[1]}
                    onChange={(e) => updateRange(i, "end", `${r.end.split(":")[0]}:${e.target.value}`)}
                    style={timeSelectStyle}
                  >
                    {["00", "30"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <button onClick={() => removeRangeRow(i)} type="button">Remove</button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button type="button" onClick={addRangeRow}>+ Add Time Range</button>
          <button type="button" onClick={() => setRanges([{ start: "08:00", end: "12:30" }])}>Reset Time Ranges</button>
        </div>
      </div>

      <button disabled={busy} onClick={submit} style={{ width: "100%", padding: 10, fontWeight: 700 }}>
        Save Availability
      </button>

      <hr style={{ margin: "14px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <b>Availability Rules:</b>
        <button disabled={busy} onClick={() => void run(onClearAll)} type="button">Clear All</button>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {existingRules.length === 0 && <div style={{ color: "#666", fontSize: 13 }}>No availability rules.</div>}
        {existingRules.map((r) => (
          <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13 }}>
                <b>{r.kind === "CYCLIC" ? "RECURRING" : "ONE-TIME"}</b>
                <div style={{ color: "#444" }}>
                  {r.kind === "CYCLIC"
                    ? `${r.fromDate} → ${r.toDate}, days: ${formatDaysMask(r.daysMask)}`
                    : `date: ${r.date}`}
                </div>
                <div style={{ color: "#444" }}>
                  time ranges: {r.ranges.map(tr => `${minToHHMM(tr.startMin)}-${minToHHMM(tr.endMin)}`).join(" | ")}
                </div>
              </div>
              <button disabled={busy} onClick={() => void run(() => onRemoveRule(r.id))} type="button">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
