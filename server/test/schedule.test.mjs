import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScheduleAction, normalizeSchedule, visibleSchedule } from "../dist/schedule.js";

const patient = { uid: "patient-1", role: "PATIENT", email: "patient@example.test" };
const doctor = { uid: "doctor-1", role: "DOCTOR", doctorId: "d1" };
const now = Date.parse("2029-01-01T00:00:00Z");
function seed() {
  return normalizeSchedule({
    doctors: [{ id: "d1", name: "Demo Doctor", specialization: "Cardiology" }],
    availabilityRules: [{ id: "r1", doctorId: "d1", kind: "ONE_TIME", date: "2030-01-07", ranges: [{ startMin: 540, endMin: 720 }] }],
  });
}
function booking(id = "a1", start = "2030-01-07T08:00:00Z", end = "2030-01-07T08:30:00Z") {
  return { action: "book", timeZone: "Europe/Warsaw", appointment: {
    id, doctorId: "d1", start, end, type: "FIRST_VISIT",
    patient: { id: "p1", name: "Demo Patient", age: 28, gender: "F" },
    notes: "Private note", documents: ["results.pdf"], patientUserId: "forged-owner", paid: true,
  } };
}
const apply = (db, user, action) => applyScheduleAction(db, user, action, now);
const rejectsCode = (fn, code) => assert.throws(fn, error => error.code === code);

test("booking derives ownership from authentication and retains patient details", () => {
  const saved = apply(seed(), patient, booking()).bookedAppointments.a1;
  assert.equal(saved.patientUserId, patient.uid);
  assert.equal(saved.patient.age, 28);
  assert.equal(saved.patient.gender, "F");
  assert.equal(saved.paid, undefined);
});
test("overlapping bookings are rejected but adjacent bookings are allowed", () => {
  const db = apply(seed(), patient, booking());
  rejectsCode(() => apply(db, patient, booking("a2")), "appointment_conflict");
  assert.ok(apply(db, patient, booking("a2", "2030-01-07T08:30:00Z", "2030-01-07T09:00:00Z")).bookedAppointments.a2);
});
test("booking validates role, patient age, future time, availability and clinic zone", () => {
  rejectsCode(() => apply(seed(), doctor, booking()), "only_patient");
  const bad = booking(); bad.appointment.patient.age = 28.5;
  rejectsCode(() => apply(seed(), patient, bad), "invalid_patient_age");
  rejectsCode(() => apply(seed(), patient, booking("a1", "2020-01-07T08:00:00Z", "2020-01-07T08:30:00Z")), "invalid_appointment_time");
  rejectsCode(() => apply(seed(), patient, booking("a1", "2030-01-07T07:00:00Z", "2030-01-07T07:30:00Z")), "outside_availability");
  rejectsCode(() => apply(seed(), patient, { ...booking(), timeZone: "UTC" }), "time_zone_mismatch");
});
test("recurring rules and DST use the clinic civil date", () => {
  const db = seed();
  db.availabilityRules = [{ id: "r2", doctorId: "d1", kind: "CYCLIC", fromDate: "2030-03-01", toDate: "2030-04-30", daysMask: [1], ranges: [{ startMin: 540, endMin: 600 }] }];
  assert.ok(apply(db, patient, booking("winter", "2030-03-25T08:00:00Z", "2030-03-25T08:30:00Z")).bookedAppointments.winter);
  assert.ok(apply(db, patient, booking("summer", "2030-04-01T07:00:00Z", "2030-04-01T07:30:00Z")).bookedAppointments.summer);
});
test("cancellation retains the reason and releases occupancy", () => {
  const db = apply(seed(), patient, booking());
  const canceled = apply(db, patient, { action: "cancel", id: "a1", reason: "Plans changed" });
  assert.equal(canceled.bookedAppointments.a1.status, "CANCELED");
  assert.equal(canceled.bookedAppointments.a1.cancelReason, "Plans changed");
  assert.ok(apply(canceled, patient, booking("a2")).bookedAppointments.a2);
  rejectsCode(() => apply(db, { ...patient, uid: "other" }, { action: "cancel", id: "a1" }), "forbidden");
});
test("payments are owner-only and reject canceled appointments atomically", () => {
  const db = apply(seed(), patient, booking());
  rejectsCode(() => apply(db, { ...patient, uid: "other" }, { action: "pay", ids: ["a1"] }), "forbidden");
  assert.equal(apply(db, patient, { action: "pay", ids: ["a1"] }).bookedAppointments.a1.paid, true);
  const canceled = apply(db, patient, { action: "cancel", id: "a1", reason: "" });
  rejectsCode(() => apply(canceled, patient, { action: "pay", ids: ["a1"] }), "appointment_canceled");
  assert.equal(db.bookedAppointments.a1.paid, undefined);
});
test("an absence atomically cancels conflicts and creates notification records", () => {
  const db = apply(seed(), patient, booking());
  const command = { action: "addAbsence", timeZone: "Europe/Warsaw", absence: { id: "abs1", doctorId: "d1", fromDate: "2030-01-07", toDate: "2030-01-07", reason: "Unavailable" } };
  const saved = apply(db, doctor, command);
  assert.equal(saved.appointmentsOverrides[0].id, "a1");
  assert.equal(saved.notifications[0].appointmentId, "a1");
  assert.equal(saved.absences.length, 1);
  rejectsCode(() => apply(saved, patient, booking("a2")), "doctor_absent");
  rejectsCode(() => apply(saved, doctor, command), "absence_overlap");
});
test("doctors cannot edit another doctor's availability or absences", () => {
  rejectsCode(() => apply(seed(), { ...doctor, doctorId: "d2" }, { action: "clearRules", doctorId: "d1" }), "forbidden");
  rejectsCode(() => apply(seed(), patient, { action: "clearRules", doctorId: "d1" }), "forbidden");
  assert.equal(apply(seed(), doctor, { action: "clearRules", doctorId: "d1" }).availabilityRules.length, 0);
});
test("invalid dates and overlapping availability ranges are rejected", () => {
  rejectsCode(() => apply(seed(), doctor, { action: "addAbsence", timeZone: "Europe/Warsaw", absence: { id: "abs1", doctorId: "d1", fromDate: "2030-02-31", toDate: "2030-03-03" } }), "invalid_schedule_input");
  rejectsCode(() => apply(seed(), doctor, { action: "addRule", timeZone: "Europe/Warsaw", rule: { id: "r2", doctorId: "d1", kind: "ONE_TIME", date: "2030-01-07", ranges: [{ startMin: 540, endMin: 600 }, { startMin: 570, endMin: 630 }] } }), "invalid_schedule_input");
});
test("schedule filtering exposes occupancy, not other patients' medical data", () => {
  const db = apply(seed(), patient, booking());
  const other = visibleSchedule(db, { uid: "other", role: "PATIENT" }).bookedAppointments.a1;
  for (const key of ["patient", "patientUserId", "patientEmail", "notes", "documents"]) assert.equal(other[key], undefined);
  assert.equal(other.start, db.bookedAppointments.a1.start);
  assert.equal(other.type, "FOLLOW_UP");
  assert.equal(visibleSchedule(db, doctor).bookedAppointments.a1.notes, "Private note");
  assert.equal(visibleSchedule(db, patient).bookedAppointments.a1.notes, "Private note");
  assert.equal(visibleSchedule(db, { ...doctor, doctorId: "d2" }).bookedAppointments.a1.notes, undefined);
  rejectsCode(() => visibleSchedule(db, { uid: "", role: "GUEST" }), "forbidden");
});
test("legacy array records retain IDs and input data is never mutated", () => {
  const db = seed();
  db.bookedAppointments = [{ ...booking().appointment, id: "legacy", status: "BOOKED", patientUserId: patient.uid }];
  const original = structuredClone(db);
  const normalized = normalizeSchedule(db);
  assert.equal(normalized.bookedAppointments["0"].id, "legacy");
  apply(db, patient, { action: "cancel", id: "legacy", reason: "Canceled" });
  assert.deepEqual(db, original);
});
