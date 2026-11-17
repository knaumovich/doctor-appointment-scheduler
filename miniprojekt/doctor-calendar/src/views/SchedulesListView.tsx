import { useEffect, useState } from "react";
import type { CalendarPayload, DoctorProfile } from "../lib/types";
import { useRouter } from "../lib/router";

export function SchedulesListView() {
  const { navigate } = useRouter();
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/calendar.json")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((payload: CalendarPayload) => {
        setData(payload);
      })
      .catch((e) => {
        console.error(e);
        setError("Unable to load doctor schedules.");
      });
  }, []);

  const doctors: DoctorProfile[] =
    data?.doctors && data.doctors.length > 0 ? data.doctors : data?.doctor ? [data.doctor] : [];

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Doctor Schedules</h2>
      {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}
      {!data ? (
        <div>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {doctors.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666" }}>No doctors available.</div>
          ) : (
            doctors.map((doc) => (
              <div
                key={doc.id}
                style={{ border: "1px solid #e2e2e2", background: "white", padding: 12, borderRadius: 10 }}
              >
                <div style={{ fontWeight: 700 }}>{doc.name}</div>
                <div style={{ fontSize: 13, color: "#666" }}>{doc.specialization}</div>
                <button
                  type="button"
                  style={{ marginTop: 8, fontWeight: 700 }}
                  onClick={() => navigate(`/doctor?doctorId=${doc.id}`)}
                >
                  View Schedule
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
