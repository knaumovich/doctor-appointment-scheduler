import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

const projectId = "demo-doctor-calendar";
const api = "http://127.0.0.1:3339";
let environment, server, serverOutput = "";
let patient, other, doctor;
const timeZone = "Europe/Warsaw";
const future = new Date(Date.now() + 7 * 86400_000);
future.setUTCHours(12, 0, 0, 0);
const day = future.toISOString().slice(0, 10);
const appointment = (id) => ({
  id, doctorId: "d1", start: future.toISOString(),
  end: new Date(future.getTime() + 1800_000).toISOString(), type: "FIRST_VISIT",
  patient: { id: "p1", name: "Demo Patient", age: 30, gender: "F" },
  documents: ["results.pdf"], notes: "Private patient note",
});

async function account(email) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Emulator-only-123!", returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function request(path, user, body, method = body ? "POST" : "GET") {
  return fetch(api + path, {
    method, headers: { "Content-Type": "application/json", ...(user ? { Authorization: "Bearer " + user.idToken } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function seed() {
  await environment.withSecurityRulesDisabled(async context => {
    await context.database().ref().set({
      users: {
        [patient.localId]: { uid: patient.localId, role: "PATIENT", banned: false, email: "patient@example.test" },
        [other.localId]: { uid: other.localId, role: "PATIENT", banned: false },
        [doctor.localId]: { uid: doctor.localId, role: "DOCTOR", doctorId: "d1", banned: false },
      },
      consultationsDb: {
        meta: { version: 1, updatedAt: new Date().toISOString() },
        doctors: [{ id: "d1", name: "Demo Doctor", specialization: "Cardiology" }],
        availabilityRules: [{ id: "r1", doctorId: "d1", kind: "ONE_TIME", date: day, ranges: [{ startMin: 0, endMin: 1440 }] }],
      },
    });
  });
}
before(async () => {
  assert.ok(process.env.FIREBASE_DATABASE_EMULATOR_HOST, "Run this test through npm run test:integration");
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "Auth emulator is required");
  environment = await initializeTestEnvironment({
    projectId,
    database: { host: "127.0.0.1", port: 9000, rules: await readFile(new URL("../firebase.database.rules.json", import.meta.url), "utf8") },
  });
  patient = await account("patient@example.test");
  other = await account("other@example.test");
  doctor = await account("doctor@example.test");
  await seed();
  server = spawn(process.execPath, ["server/dist/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env, PORT: "3339", GCLOUD_PROJECT: projectId,
      FIREBASE_DATABASE_URL: "http://127.0.0.1:9000?ns=" + projectId,
      FIREBASE_SERVICE_ACCOUNT_PATH: "", FIREBASE_SERVICE_ACCOUNT_JSON: "",
      DOTENV_CONFIG_PATH: "/tmp/doctor-calendar-emulator-unused.env",
      ADMIN_EMAILS: "", SCHEDULE_TIME_ZONE: timeZone,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { serverOutput += chunk; });
  server.stderr.on("data", chunk => { serverOutput += chunk; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(api + "/health")).ok) return; } catch { /* startup */ }
    await delay(100);
  }
  throw new Error("API failed to start: " + serverOutput);
});
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
  await environment?.cleanup();
});

test("database rules prevent role escalation and private data reads", async () => {
  const db = environment.authenticatedContext(patient.localId).database();
  await assertSucceeds(db.ref("users/" + patient.localId).once("value"));
  await assertFails(db.ref("users/" + patient.localId + "/role").set("ADMIN"));
  await assertFails(db.ref("users/" + other.localId).once("value"));
  await assertFails(db.ref("consultationsDb").once("value"));
  await assertFails(db.ref("consultationsDb/bookedAppointments").set({ forged: appointment("forged") }));
  await assertSucceeds(db.ref("consultationsDb/meta").once("value"));
  await assertFails(environment.unauthenticatedContext().database().ref("consultationsDb/meta").once("value"));
});
test("API rejects unauthenticated requests and patient schedule edits", async () => {
  assert.equal((await request("/schedule")).status, 401);
  assert.equal((await request("/schedule/actions", patient, { action: "clearRules", doctorId: "d1" })).status, 403);
});
test("concurrent booking requests commit exactly one appointment", async () => {
  await seed();
  const responses = await Promise.all([
    request("/schedule/actions", patient, { action: "book", appointment: appointment("a1"), timeZone }),
    request("/schedule/actions", other, { action: "book", appointment: appointment("a2"), timeZone }),
  ]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const first = await (await request("/schedule", patient)).json();
  const records = Object.values(first.bookedAppointments);
  assert.equal(records.length, 1);
  const winner = records[0].patientUserId === patient.localId ? patient : other;
  const loser = winner === patient ? other : patient;
  const privateView = await (await request("/schedule", loser)).json();
  const hidden = Object.values(privateView.bookedAppointments)[0];
  assert.equal(hidden.patient, undefined);
  assert.equal(hidden.notes, undefined);
  assert.equal(hidden.documents, undefined);
  const doctorView = await (await request("/schedule", doctor)).json();
  assert.equal(Object.values(doctorView.bookedAppointments)[0].patient.age, 30);
  assert.equal((await request("/schedule/actions", loser, { action: "cancel", id: hidden.id, reason: "Not mine" })).status, 403);
  assert.equal((await request("/schedule/actions", winner, { action: "cancel", id: hidden.id, reason: "Changed plans" })).status, 200);
  const canceledView = await (await request("/schedule", winner)).json();
  assert.equal(Object.values(canceledView.bookedAppointments)[0].cancelReason, "Changed plans");
  assert.equal((await request("/schedule/actions", loser, { action: "book", appointment: appointment("a3"), timeZone })).status, 200);
});
test("absence and booking race cannot leave an active booking during an absence", async () => {
  await seed();
  const responses = await Promise.all([
    request("/schedule/actions", patient, { action: "book", appointment: appointment("a4"), timeZone }),
    request("/schedule/actions", doctor, { action: "addAbsence", timeZone, absence: { id: "abs1", doctorId: "d1", fromDate: day, toDate: day, reason: "Unavailable" } }),
  ]);
  assert.equal(responses[1].status, 200);
  assert.ok([200, 409].includes(responses[0].status));
  const db = await (await request("/schedule", patient)).json();
  for (const booked of Object.values(db.bookedAppointments)) {
    assert.ok(db.appointmentsOverrides.some(o => o.id === booked.id && o.status === "CANCELED"));
  }
});
test("concurrent reviews allow only one review per patient and do not expose email", async () => {
  await seed();
  await environment.withSecurityRulesDisabled(async context => {
    await context.database().ref("consultationsDb/bookedAppointments/completed").set({
      ...appointment("completed"), patientUserId: patient.localId, status: "BOOKED",
      start: "2020-01-01T09:00:00Z", end: "2020-01-01T09:30:00Z",
    });
  });
  const responses = await Promise.all([
    request("/comments/d1", patient, { rating: 5, text: "Good appointment" }),
    request("/comments/d1", patient, { rating: 4, text: "Another review" }),
  ]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const reviews = await (await request("/comments/d1")).json();
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].authorEmail, undefined);
  assert.equal(reviews[0].authorName, "Patient");
});
