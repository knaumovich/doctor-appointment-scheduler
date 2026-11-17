export type Profile = {
  uid: string;
  role: "GUEST" | "PATIENT" | "DOCTOR" | "ADMIN";
  doctorId?: string | null;
  email?: string | null;
  displayName?: string | null;
};
type Patient = { id: string; name: string; age?: number; gender?: string };
type Appointment = {
  id: string; doctorId: string; start: string; end: string; type: string; status: string;
  patient?: Patient; patientUserId?: string; patientEmail?: string | null;
  notes?: string; documents?: string[]; paid?: boolean; paidAt?: string; cancelReason?: string;
};
type Rule = {
  id: string; doctorId: string; kind: string; date?: string;
  fromDate?: string; toDate?: string; daysMask?: number[];
  ranges: { startMin: number; endMin: number }[];
};
type Absence = { id: string; doctorId: string; fromDate: string; toDate: string; reason?: string };
type Override = { id: string; status: string; cancelReason: string };
type Notification = {
  id: string; patientId: string; createdAt: string; type: string;
  title: string; message: string; appointmentId: string;
};
type Broadcast = { id: string; doctorId: string; authorUid: string; authorName: string; message: string; createdAt: string };
export type Schedule = {
  meta: { version: 1; updatedAt: string };
  doctors: { id: string; name: string; specialization: string }[];
  patients: Patient[];
  appointments: Appointment[];
  bookedAppointments: Record<string, Appointment>;
  availabilityRules: Rule[];
  absences: Absence[];
  appointmentsOverrides: Override[];
  notifications: Notification[];
  broadcasts: Broadcast[];
};
export class ScheduleError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
function requireCondition(value: unknown, code = "invalid_schedule_input", status = 400): asserts value {
  if (!value) throw new ScheduleError(status, code);
}
function object(value: unknown): Record<string, unknown> {
  requireCondition(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200, allowEmpty = false): string {
  requireCondition(typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0));
  return value.trim();
}
function id(value: unknown): string {
  const result = text(value, 128);
  requireCondition(!/[.#$[\]/]/.test(result) && result !== "__proto__" && result !== "constructor");
  return result;
}
function date(value: unknown): string {
  const result = text(value, 10);
  requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result);
  return result;
}
function list<T>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value).filter(Boolean) as T[];
}
export function normalizeSchedule(raw: unknown): Schedule {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const booked = value.bookedAppointments && typeof value.bookedAppointments === "object" ? value.bookedAppointments : {};
  return {
    meta: (value.meta as Schedule["meta"]) ?? { version: 1, updatedAt: "" },
    doctors: list(value.doctors), patients: list(value.patients),
    appointments: list(value.appointments),
    bookedAppointments: Object.fromEntries(Object.entries(booked).filter(([, a]) => a && typeof a === "object").map(([key, a]) => [key, { ...a, id: a.id || key }])),
    availabilityRules: list(value.availabilityRules), absences: list(value.absences),
    appointmentsOverrides: list(value.appointmentsOverrides),
    notifications: list(value.notifications), broadcasts: list(value.broadcasts),
  };
}
function canManage(profile: Profile, doctorId: string) {
  requireCondition(profile.role === "ADMIN" || (profile.role === "DOCTOR" && profile.doctorId === doctorId), "forbidden", 403);
}
function canSeeDetails(profile: Profile, a: Appointment) {
  return profile.role === "ADMIN" || (profile.role === "DOCTOR" && profile.doctorId === a.doctorId) ||
    (profile.role === "PATIENT" && a.patientUserId === profile.uid);
}
export function visibleSchedule(raw: unknown, profile: Profile) {
  requireCondition(profile.role !== "GUEST", "forbidden", 403);
  const db = normalizeSchedule(raw);
  if (profile.role === "ADMIN") return db;
  const all = [...db.appointments, ...Object.values(db.bookedAppointments)];
  const own = new Set(all.filter(a => canSeeDetails(profile, a)).map(a => a.id));
  const redact = (a: Appointment): Appointment => canSeeDetails(profile, a) ? a : {
    id: a.id, doctorId: a.doctorId, start: a.start, end: a.end,
    // Occupancy is public to signed-in users; medical details and consultation type are not.
    type: "FOLLOW_UP", status: a.status,
  };
  return {
    ...db, patients: [],
    appointments: db.appointments.map(redact),
    bookedAppointments: Object.fromEntries(Object.entries(db.bookedAppointments).map(([key, a]) => [key, redact(a)])),
    absences: db.absences.map(a => profile.role === "DOCTOR" && profile.doctorId === a.doctorId ? a : { ...a, reason: "" }),
    appointmentsOverrides: db.appointmentsOverrides.map(o => own.has(o.id) ? o : { ...o, cancelReason: "" }),
    notifications: db.notifications.filter(n => own.has(n.appointmentId)),
  };
}
// The schedule uses the browser's local civil time. Clients provide their IANA time zone
// so validation uses the same calendar day while stored timestamps remain UTC.
function localParts(iso: string, zone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  } catch { throw new ScheduleError(400, "invalid_time_zone"); }
  const get = (name: string) => parts.find(p => p.type === name)!.value;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return { day, weekday: new Date(day + "T12:00:00Z").getUTCDay(), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}
export function validateBooking(db: Schedule, input: unknown, profile: Profile, now: number, timeZone: string): Appointment {
  requireCondition(profile.role === "PATIENT", "only_patient", 403);
  const a = object(input);
  const doctorId = id(a.doctorId);
  requireCondition(db.doctors.some(d => d.id === doctorId), "doctor_not_found", 404);
  const start = text(a.start), end = text(a.end);
  const startMs = Date.parse(start), endMs = Date.parse(end);
  const duration = endMs - startMs;
  requireCondition(Number.isFinite(startMs) && Number.isFinite(endMs) && /(?:Z|[+-]\d{2}:\d{2})$/.test(start) && /(?:Z|[+-]\d{2}:\d{2})$/.test(end), "invalid_appointment_time");
  requireCondition(startMs > now && duration > 0 && duration <= 6 * 60 * 60_000 && duration % (30 * 60_000) === 0 && startMs % 60_000 === 0, "invalid_appointment_time");
  const local = localParts(start, timeZone);
  requireCondition(local.minute % 30 === 0, "invalid_appointment_time");
  for (let t = startMs; t < endMs; t += 30 * 60_000) {
    const slot = localParts(new Date(t).toISOString(), timeZone);
    requireCondition(slot.day === local.day, "invalid_appointment_time");
    requireCondition(!db.absences.some(a => a.doctorId === doctorId && a.fromDate <= slot.day && slot.day <= a.toDate), "doctor_absent", 409);
    requireCondition(db.availabilityRules.some(r => r.doctorId === doctorId &&
      (r.kind === "ONE_TIME" ? r.date === slot.day : r.fromDate! <= slot.day && slot.day <= r.toDate! && r.daysMask?.includes(slot.weekday)) &&
      r.ranges.some(range => range.startMin <= slot.minute && slot.minute + 30 <= range.endMin)), "outside_availability", 409);
  }
  const canceled = new Set(db.appointmentsOverrides.filter(o => o.status === "CANCELED").map(o => o.id));
  requireCondition(![...db.appointments, ...Object.values(db.bookedAppointments)].some(other =>
    other.doctorId === doctorId && other.status === "BOOKED" && !canceled.has(other.id) &&
    startMs < Date.parse(other.end) && Date.parse(other.start) < endMs), "appointment_conflict", 409);
  const patient = object(a.patient);
  const age = patient.age;
  requireCondition(Number.isInteger(age) && Number(age) > 0 && Number(age) <= 130, "invalid_patient_age");
  requireCondition(["F", "M", "OTHER"].includes(String(patient.gender)), "invalid_patient_gender");
  requireCondition(["FIRST_VISIT", "FOLLOW_UP", "CHRONIC", "PRESCRIPTION", "ONLINE", "DOCUMENTS"].includes(String(a.type)), "invalid_appointment_type");
  requireCondition(a.documents === undefined || (Array.isArray(a.documents) && a.documents.length <= 20), "invalid_documents");
  return {
    id: id(a.id), doctorId, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(),
    type: String(a.type), status: "BOOKED",
    patient: { id: id(patient.id), name: text(patient.name), age: Number(age), gender: String(patient.gender) },
    patientUserId: profile.uid, patientEmail: profile.email ?? null,
    documents: (a.documents as unknown[] | undefined)?.map(v => text(v, 255)) ?? [],
    notes: a.notes === undefined ? "" : text(a.notes, 4000, true),
  };
}
export function applyScheduleAction(raw: unknown, profile: Profile, input: unknown, now = Date.now(), timeZone = "Europe/Warsaw"): Schedule {
  const db = normalizeSchedule(structuredClone(raw));
  const command = object(input);
  const action = text(command.action);
  if (action === "book" || action === "addAbsence" || action === "addRule") {
    requireCondition(command.timeZone === timeZone, "time_zone_mismatch");
  }
  if (action === "book") {
    const appointment = validateBooking(db, command.appointment, profile, now, timeZone);
    requireCondition(!Object.values(db.bookedAppointments).some(a => a.id === appointment.id), "duplicate_appointment", 409);
    db.bookedAppointments[appointment.id] = appointment;
  } else if (action === "cancel" || action === "pay") {
    const ids = action === "pay" ? command.ids : [command.id];
    requireCondition(Array.isArray(ids) && ids.length > 0 && ids.length <= 100);
    for (const value of ids) {
      const appointmentId = id(value);
      const a = Object.values(db.bookedAppointments).find(a => a.id === appointmentId);
      requireCondition(a, "appointment_not_found", 404);
      requireCondition(profile.role === "PATIENT" && a.patientUserId === profile.uid, "forbidden", 403);
      requireCondition(a.status === "BOOKED" && !db.appointmentsOverrides.some(o => o.id === a.id && o.status === "CANCELED"), "appointment_canceled", 409);
      if (action === "cancel") {
        requireCondition(Date.parse(a.start) > now, "appointment_started", 409);
        a.status = "CANCELED";
        a.cancelReason = text(command.reason ?? "", 1000, true);
      } else {
        // This only records a simulated payment; never accept real card information.
        a.paid = true;
        a.paidAt = new Date(now).toISOString();
      }
    }
  } else if (action === "addRule") {
    const value = object(command.rule);
    const doctorId = id(value.doctorId);
    canManage(profile, doctorId);
    const ruleId = id(value.id);
    requireCondition(!db.availabilityRules.some(r => r.id === ruleId), "duplicate_rule", 409);
    requireCondition(Array.isArray(value.ranges) && value.ranges.length > 0 && value.ranges.length <= 48);
    const ranges = value.ranges.map(v => {
      const r = object(v);
      requireCondition(Number.isInteger(r.startMin) && Number.isInteger(r.endMin));
      const startMin = Number(r.startMin), endMin = Number(r.endMin);
      requireCondition(startMin >= 0 && endMin <= 1440 && startMin < endMin && startMin % 30 === 0 && endMin % 30 === 0);
      return { startMin, endMin };
    }).sort((a, b) => a.startMin - b.startMin);
    requireCondition(ranges.every((r, i) => i === 0 || ranges[i - 1].endMin <= r.startMin));
    const rule: Rule = { id: ruleId, doctorId, kind: text(value.kind), ranges };
    if (rule.kind === "ONE_TIME") rule.date = date(value.date);
    else {
      requireCondition(rule.kind === "CYCLIC");
      rule.fromDate = date(value.fromDate); rule.toDate = date(value.toDate);
      requireCondition(rule.fromDate <= rule.toDate);
      requireCondition(Array.isArray(value.daysMask) && value.daysMask.length > 0 && value.daysMask.every(d => Number.isInteger(d) && d >= 0 && d <= 6));
      rule.daysMask = value.daysMask;
    }
    db.availabilityRules.unshift(rule);
  } else if (action === "removeRule" || action === "clearRules" || action === "removeAbsence") {
    const doctorId = id(command.doctorId);
    canManage(profile, doctorId);
    const target = action === "clearRules" ? "" : id(command.id);
    if (action === "removeAbsence") db.absences = db.absences.filter(a => a.doctorId !== doctorId || a.id !== target);
    else db.availabilityRules = db.availabilityRules.filter(r => r.doctorId !== doctorId || (action !== "clearRules" && r.id !== target));
  } else if (action === "addAbsence") {
    const value = object(command.absence);
    const absence: Absence = { id: id(value.id), doctorId: id(value.doctorId), fromDate: date(value.fromDate), toDate: date(value.toDate), reason: text(value.reason ?? "", 1000, true) };
    canManage(profile, absence.doctorId);
    requireCondition(absence.fromDate <= absence.toDate);
    requireCondition(!db.absences.some(a => a.id === absence.id || (a.doctorId === absence.doctorId && a.fromDate <= absence.toDate && absence.fromDate <= a.toDate)), "absence_overlap", 409);
    const zone = timeZone;
    db.absences.unshift(absence);
    for (const a of [...db.appointments, ...Object.values(db.bookedAppointments)]) {
      const day = localParts(a.start, zone).day;
      if (a.doctorId !== absence.doctorId || a.status !== "BOOKED" || day < absence.fromDate || day > absence.toDate || db.appointmentsOverrides.some(o => o.id === a.id && o.status === "CANCELED")) continue;
      db.appointmentsOverrides.push({ id: a.id, status: "CANCELED", cancelReason: absence.reason ?? "" });
      if (a.patient) db.notifications.unshift({
        id: absence.id + "-" + a.id, patientId: a.patient.id, createdAt: new Date(now).toISOString(),
        type: "APPOINTMENT_CANCELED", title: "Appointment canceled",
        message: `Your appointment on ${day} has been canceled (${absence.reason}).`, appointmentId: a.id,
      });
    }
  } else if (action === "broadcast") {
    const value = object(command.broadcast);
    const doctorId = id(value.doctorId);
    canManage(profile, doctorId);
    db.broadcasts.unshift({ id: id(value.id), doctorId, authorUid: profile.uid, authorName: profile.displayName || "Doctor", message: text(value.message, 2000), createdAt: new Date(now).toISOString() });
  } else {
    throw new ScheduleError(400, "unknown_schedule_action");
  }
  db.meta = { version: 1, updatedAt: new Date(now).toISOString() };
  return db;
}
