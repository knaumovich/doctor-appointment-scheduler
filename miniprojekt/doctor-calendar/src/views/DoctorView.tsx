import { useEffect, useMemo, useState } from "react";
import type { CalendarPayload, DoctorProfile } from "../lib/types";
import { useAvailabilityRules } from "../lib/useAvailabilityRules";
import { useAbsences } from "../lib/useAbsences";
import { useAppointmentOverrides } from "../lib/useAppointmentOverrides";
import { consultationsService } from "../lib/consultationsService";
import { isoDate } from "../lib/date";
import { addDays, startOfWeekMonday } from "../lib/time";
import { useAuth } from "../auth/useAuth";
import { can } from "../lib/roles";
import { CommentsSection } from "../components/CommentsSection";
import { useRouter } from "../lib/router";
import { useBroadcasts } from "../lib/useBroadcasts";

import { AvailabilityForm } from "../components/AvailabilityForm";
import { AbsenceForm } from "../components/AbsenceForm";
import { WeekCalendar } from "../components/WeekCalendar";

type Panel = "AVAIL" | "ABS";

function resolveDoctors(payload: CalendarPayload): DoctorProfile[] {
  if (payload.doctors && payload.doctors.length > 0) return payload.doctors;
  if (payload.doctor) return [payload.doctor];
  return [];
}

function initialAnchorFromData() {
  return new Date();
}

export function DoctorView({ variant = "DEFAULT" }: { variant?: "DEFAULT" | "VIEW" | "MANAGE" }) {
  const { role, user, doctorId: doctorProfileId } = useAuth();
  const { search, navigate } = useRouter();
  const [data, setData] = useState<CalendarPayload | null>(null);

  const { rules, addRule, removeRule, clearAll } = useAvailabilityRules();
  const { absences, addAbsence, removeAbsence } = useAbsences();

  const {
    applyOverrides,
    error: scheduleError,
    addBookedAppointment,

    bookedMine,
    cancelBookedAppointment,

  } = useAppointmentOverrides(user?.uid);

  const isDoctorUser = role === "DOCTOR";
  const manageMode = variant === "MANAGE";
  const canBook = can(role, "bookAppointments");
  const canEditScheduleBase = can(role, "editSchedule");

  const [panel, setPanel] = useState<Panel>("AVAIL");
  const viewMode = isDoctorUser ? "DOCTOR" : "PATIENT";
  const [anchorDate, setAnchorDate] = useState<Date>(initialAnchorFromData);

  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  const appointments = applyOverrides(data?.appointments ?? []);

  const doctors = data ? resolveDoctors(data) : [];
  const queryDoctorId = useMemo(() => new URLSearchParams(search).get("doctorId") ?? "", [search]);
  const doctorIdFromQuery =
    queryDoctorId && doctors.some((d) => d.id === queryDoctorId) ? queryDoctorId : "";
  const doctorIdFromProfile =
    doctorProfileId && doctors.some((d) => d.id === doctorProfileId) ? doctorProfileId : "";
  const resolvedDoctorId = isDoctorUser ? doctorIdFromProfile || "" : doctorIdFromQuery || doctors[0]?.id || "";
  const canEditSchedule = manageMode && canEditScheduleBase && (!isDoctorUser || Boolean(doctorIdFromProfile));

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
        alert(`Unable to load calendar.json: ${String(e)}`);
      });
  }, []);

  const doctorId = resolvedDoctorId;
  const { broadcasts } = useBroadcasts(doctorId);

  if (!data) return <div style={{ padding: 16 }}>Loading…</div>;
  if (doctors.length === 0) {
    return <div style={{ padding: 16 }}>No doctors available.</div>;
  }
  if (isDoctorUser && !doctorIdFromProfile) {
    return <div style={{ padding: 16 }}>Your account is not linked to a doctor. Contact an administrator.</div>;
  }
  if (!resolvedDoctorId || !anchorDate) return <div style={{ padding: 16 }}>Loading…</div>;

  const selectedDoctor = doctors.find((d) => d.id === doctorId) ?? doctors[0];
  const doctorRules = rules.filter((r) => r.doctorId === doctorId);
  const doctorAbsences = absences.filter((a) => a.doctorId === doctorId);
  const canBroadcast = manageMode && role === "DOCTOR" && doctorProfileId === doctorId;

  const weekStart = startOfWeekMonday(anchorDate);
  const weekStartIso = isoDate(weekStart);
  const weekEndIso = isoDate(addDays(weekStart, 6));

  return (
    <div
      style={{
        padding: 16,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {/* LEFT */}
        <div
          style={{
            display: "grid",
            gap: 12,
            alignContent: "start",
            flex: "1 1 340px",
            maxWidth: 420,
            minWidth: 280,
          }}
        >
          <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, background: "white" }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{selectedDoctor?.name}</div>
            <div style={{ fontSize: 13, color: "#555" }}>{selectedDoctor?.specialization}</div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
              Week: <b>{weekStartIso}</b> → <b>{weekEndIso}</b>
            </div>

            {doctors.length > 1 && !doctorIdFromProfile && (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, color: "#555" }}>Select a Doctor</label>
                <select
                  value={doctorId}
                  onChange={(e) => navigate(`/doctor?doctorId=${e.target.value}`)}
                  style={{ padding: "6px 8px" }}
                >
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} ({doc.specialization})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canBroadcast && (
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, color: "#555" }}>Patient Announcement</label>
                <textarea
                  rows={2}
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="e.g. Online appointments are available until 18:00 today."
                />
                <button
                  type="button"
                  disabled={broadcastBusy || !broadcastText.trim()}
                  onClick={async () => {
                    if (!user) return;
                    setBroadcastBusy(true);
                    try {
                      await consultationsService.addBroadcast({
                        id: "",
                        doctorId,
                        authorUid: user.uid,
                        authorName: user.displayName || user.email || "Doctor",
                        message: broadcastText.trim(),
                        createdAt: new Date().toISOString(),
                      });
                      setBroadcastText("");
                    } catch (err) {
                      console.error(err);
                      alert("Unable to send the announcement.");
                    } finally {
                      setBroadcastBusy(false);
                    }
                  }}
                  style={{ justifySelf: "start" }}
                >
                  {broadcastBusy ? "Sending…" : "Send Announcement"}
                </button>
              </div>
            )}

            {canEditSchedule && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setPanel("AVAIL")}
                  style={{ fontWeight: panel === "AVAIL" ? 800 : 500 }}
                  disabled={viewMode !== "DOCTOR"}
                >
                  Availability
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("ABS")}
                  style={{ fontWeight: panel === "ABS" ? 800 : 500 }}
                  disabled={viewMode !== "DOCTOR"}
                >
                  Absences
                </button>
              </div>
            )}

            {viewMode === "PATIENT" && canBook && (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.3 }}>
                  Select <b>“Book Appointment”</b> and click an available time slot in the calendar.
                </div>
              </div>
            )}
          </div>

          {canEditSchedule && viewMode === "DOCTOR" && panel === "AVAIL" ? (
            <AvailabilityForm
              key={`avail-${weekStartIso}`}
              doctorId={doctorId}
              existingRules={doctorRules}
              onAddRule={addRule}
              onRemoveRule={(id) => removeRule(id, doctorId)}
              onClearAll={() => clearAll(doctorId)}
              defaultFromDate={weekStartIso}
              defaultToDate={weekEndIso}
              defaultOneDate={weekStartIso}
            />
          ) : canEditSchedule && viewMode === "DOCTOR" ? (
            <AbsenceForm
              key={`abs-${weekStartIso}`}
              doctorId={doctorId}
              appointments={appointments}
              existingAbsences={doctorAbsences}
              onAddAbsence={addAbsence}
              onRemoveAbsence={(id) => removeAbsence(id, doctorId)}
              defaultFromDate={weekStartIso}
              defaultToDate={weekStartIso}
            />
          ) : null}
        </div>

        {/* RIGHT */}
        <div
          style={{
            flex: "1 1 560px",
            minWidth: 0,
            maxWidth: 980,
            width: "100%",
            overflow: "hidden",
          }}
        >
          {scheduleError && <div role="alert" style={{ color: "#b00020", padding: 12 }}>Unable to load the schedule. Check the backend connection and Firebase setup, then refresh the page.</div>}

          {broadcasts.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                padding: 10,
                borderRadius: 10,
                background: "#f7f7f7",
                border: "1px solid #e2e2e2",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Doctor Announcements</div>
              <div style={{ display: "grid", gap: 6 }}>
                {broadcasts.slice(0, 3).map((b) => (
                  <div key={b.id} style={{ fontSize: 12 }}>
                    <div style={{ color: "#666" }}>{new Date(b.createdAt).toLocaleString("en-GB")}</div>
                    <div>{b.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <WeekCalendar
            key={`${doctorId}:${viewMode}`}
            doctorId={doctorId}
            appointments={appointments}
            availabilityRules={rules}
            absences={absences}
            viewMode={viewMode}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            onBookAppointment={canBook ? addBookedAppointment : undefined}
            currentUserId={user?.uid}
            currentUserEmail={user?.email ?? null}
            patientBookedIds={bookedMine.map((a) => a.id)}
            onCancelBookedAppointment={canBook ? cancelBookedAppointment : undefined}
          />

          <CommentsSection
            doctorId={doctorId}
            doctorProfileId={doctorProfileId}
          />
        </div>
      </div>

    </div>
  );
}
