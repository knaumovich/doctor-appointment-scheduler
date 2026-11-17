import "dotenv/config";
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import fs from "node:fs";
import { applyScheduleAction, normalizeSchedule, visibleSchedule, ScheduleError } from "./schedule.js";
import { commitScheduleAction } from "./scheduleRepository.js";

type UserRole = "GUEST" | "PATIENT" | "DOCTOR" | "ADMIN";

type UserProfile = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  role: UserRole;
  banned: boolean;
  doctorId?: string | null;
  createdAt: string;
};

type AuthedRequest = express.Request & {
  user?: admin.auth.DecodedIdToken;
  profile?: UserProfile;
};

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",").map(s => s.trim());
app.use(cors({ origin: allowedOrigins }));
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function asyncHandler(handler: (req: AuthedRequest, res: express.Response, next: express.NextFunction) => Promise<unknown>): express.RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_EMAIL_SET = new Set(ADMIN_EMAILS);

function initAdmin() {
  if (admin.apps.length > 0) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  let credential: admin.credential.Credential;

  if (json) {
    credential = admin.credential.cert(JSON.parse(json));
  } else if (path) {
    const raw = fs.readFileSync(path, "utf-8");
    credential = admin.credential.cert(JSON.parse(raw));
  } else {
    credential = admin.credential.applicationDefault();
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    console.warn("FIREBASE_DATABASE_URL is missing. Provide it in .env for RTDB access.");
  }

  admin.initializeApp({
    credential,
    databaseURL,
  });
}

initAdmin();

const db = admin.database();

async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await db.ref(`users/${uid}`).get();
  if (!snap.exists()) return null;
  return snap.val() as UserProfile;
}

async function ensureProfile(uid: string, data: Partial<UserProfile>, verifiedEmail = false): Promise<UserProfile> {
  const existing = await getProfile(uid);
  if (existing) return existing;

  const roleFromEmail = verifiedEmail && data.email && ADMIN_EMAIL_SET.has(data.email.toLowerCase()) ? "ADMIN" : undefined;
  const profile: UserProfile = {
    uid,
    email: data.email ?? null,
    displayName: data.displayName ?? null,
    role: roleFromEmail ?? data.role ?? "PATIENT",
    banned: data.banned ?? false,
    doctorId: data.doctorId ?? null,
    createdAt: new Date().toISOString(),
  };
  const result = await db.ref(`users/${uid}`).transaction(current => current ?? profile);
  return result.snapshot.val() as UserProfile;
}

async function authMiddleware(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: "invalid_token" });
  }
}

async function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user) return res.status(401).json({ error: "missing_user" });
  const profile = await getProfile(req.user.uid);
  if (!profile || profile.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  req.profile = profile;
  return next();
}

app.get("/auth/me", asyncHandler(authMiddleware), asyncHandler(async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  const profile = await getProfile(uid);
  if (!profile) {
    return res.status(404).json({ error: "profile_missing" });
  }
  return res.json(profile);
}));

app.post("/auth/bootstrap", asyncHandler(authMiddleware), asyncHandler(async (req: AuthedRequest, res) => {
  const uid = req.user!.uid;
  const profile = await ensureProfile(uid, {
    email: req.user!.email ?? null,
    displayName: req.user!.name ?? null,
    role: "PATIENT",
    banned: false,
  }, req.user!.email_verified === true);
  return res.json(profile);
}));

app.get("/admin/users", asyncHandler(authMiddleware), asyncHandler(requireAdmin), asyncHandler(async (_req: AuthedRequest, res) => {
  const snap = await db.ref("users").get();
  if (!snap.exists()) return res.json([]);
  const data = snap.val() as Record<string, UserProfile>;
  const list = Object.values(data).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return res.json(list);
}));

app.post("/admin/register-doctor", asyncHandler(authMiddleware), asyncHandler(requireAdmin), asyncHandler(async (req: AuthedRequest, res) => {
  const { email, password, displayName, doctorId } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
    doctorId?: string;
  };

  if (typeof email !== "string" || typeof password !== "string" || password.length < 8 || typeof doctorId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(doctorId)) {
    return res.status(400).json({ error: "email_and_password_required" });
  }

  const schedule = normalizeSchedule((await db.ref("consultationsDb").get()).val());
  if (!schedule.doctors.some(d => d.id === doctorId)) return res.status(400).json({ error: "doctor_not_found" });

  const user = await admin.auth().createUser({
    email,
    password,
    displayName,
  });

  await ensureProfile(user.uid, {
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    role: "DOCTOR",
    banned: false,
    doctorId: doctorId ?? null,
  });

  return res.json({ uid: user.uid });
}));

type CommentReply = {
  text: string;
  createdAt: string;
  authorUid: string;
  authorName: string;
};

type DoctorComment = {
  id: string;
  doctorId: string;
  authorUid: string;
  authorName: string;
  authorEmail?: string | null;
  rating: number;
  text: string;
  createdAt: string;
  reply?: CommentReply;
};

type Appointment = {
  id: string;
  doctorId: string;
  start: string;
  end: string;
  status: string;
  patientUserId?: string;
};

type DbOverride = {
  id: string;
  status: "CANCELED";
};

function normalizeBookedAppointments(raw: Record<string, Appointment> | Appointment[] | undefined) {
  if (!raw) return [] as Appointment[];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, value]) => value && typeof value === "object")
      .map(([key, value]) => {
        const appt = value as Appointment;
        if (!appt.id) appt.id = key;
        return appt;
      });
  }
  return [] as Appointment[];
}

async function hasCompletedAppointment(uid: string, doctorId: string) {
  const [bookedSnap, overridesSnap] = await Promise.all([
    db.ref("consultationsDb/bookedAppointments").get(),
    db.ref("consultationsDb/appointmentsOverrides").get(),
  ]);

  const overridesRaw = (overridesSnap.exists() ? overridesSnap.val() : []) as DbOverride[] | Record<string, DbOverride>;
  const overridesList = Array.isArray(overridesRaw) ? overridesRaw : Object.values(overridesRaw ?? {});
  const canceled = new Set(overridesList.filter((o) => o?.status === "CANCELED").map((o) => o.id));

  const bookedRaw = bookedSnap.exists() ? (bookedSnap.val() as Record<string, Appointment> | Appointment[]) : undefined;
  const booked = normalizeBookedAppointments(bookedRaw);
  const now = Date.now();

  return booked.some((a) => {
    if (a.doctorId !== doctorId) return false;
    if (a.patientUserId !== uid) return false;
    if (a.status !== "BOOKED") return false;
    if (canceled.has(a.id)) return false;
    const end = new Date(a.end).getTime();
    return Number.isFinite(end) && end < now;
  });
}

app.get("/comments/:doctorId", asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const snap = await db.ref(`comments/${doctorId}`).get();
  if (!snap.exists()) return res.json([]);
  const data = snap.val() as Record<string, DoctorComment>;
  const list = Object.values(data).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json(list.map(({ authorEmail, ...comment }) => ({ ...comment, authorName: comment.authorName === authorEmail ? "Patient" : comment.authorName })));
}));

app.post("/comments/:doctorId", asyncHandler(authMiddleware), asyncHandler(async (req: AuthedRequest, res) => {
  const { doctorId } = req.params;
  const { rating, text } = req.body as { rating?: number; text?: string };
  const profile = await getProfile(req.user!.uid);

  if (!profile || profile.role !== "PATIENT") {
    return res.status(403).json({ error: "only_patient" });
  }
  if (profile.banned) {
    return res.status(403).json({ error: "banned" });
  }
  if (!Number.isInteger(rating) || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "invalid_rating" });
  }
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return res.status(400).json({ error: "missing_text" });
  }

  const eligible = await hasCompletedAppointment(profile.uid, doctorId);
  if (!eligible) {
    return res.status(403).json({ error: "no_completed_visit" });
  }

  const id = db.ref(`comments/${doctorId}`).push().key!;
  const comment: DoctorComment = {
    id,
    doctorId,
    authorUid: profile.uid,
    authorName: profile.displayName || "Patient",
    authorEmail: profile.email ?? null,
    rating,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  const result = await db.ref(`comments/${doctorId}`).transaction((current: Record<string, DoctorComment> | null) => {
    if (Object.values(current ?? {}).some(c => c.authorUid === profile.uid)) return undefined;
    return { ...(current ?? {}), [id]: comment };
  });
  if (!result.committed) return res.status(409).json({ error: "already_commented" });
  return res.json(comment);
}));

app.post("/comments/:doctorId/:commentId/reply", asyncHandler(authMiddleware), asyncHandler(async (req: AuthedRequest, res) => {
  const { doctorId, commentId } = req.params;
  const { text } = req.body as { text?: string };
  const profile = await getProfile(req.user!.uid);

  if (!profile || profile.role !== "DOCTOR") {
    return res.status(403).json({ error: "only_doctor" });
  }
  if (profile.banned) {
    return res.status(403).json({ error: "banned" });
  }
  if (!profile.doctorId || profile.doctorId !== doctorId) {
    return res.status(403).json({ error: "doctor_mismatch" });
  }
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return res.status(400).json({ error: "missing_text" });
  }

  const ref = db.ref(`comments/${doctorId}/${commentId}`);
  const snap = await ref.get();
  if (!snap.exists()) return res.status(404).json({ error: "comment_not_found" });

  const comment = snap.val() as DoctorComment;
  const reply: CommentReply = {
    text: text.trim(),
    createdAt: new Date().toISOString(),
    authorUid: profile.uid,
    authorName: profile.displayName || "Doctor",
  };

  const updated: DoctorComment = { ...comment, reply };
  await ref.set(updated);
  return res.json(updated);
}));

app.delete("/comments/:doctorId/:commentId", asyncHandler(authMiddleware), asyncHandler(requireAdmin), asyncHandler(async (req: AuthedRequest, res) => {
  const { doctorId, commentId } = req.params;
  const ref = db.ref(`comments/${doctorId}/${commentId}`);
  const snap = await ref.get();
  if (!snap.exists()) return res.status(404).json({ error: "comment_not_found" });
  await ref.remove();
  return res.json({ id: commentId });
}));

app.post("/admin/ban-user", asyncHandler(authMiddleware), asyncHandler(requireAdmin), asyncHandler(async (req: AuthedRequest, res) => {
  const { uid, banned } = req.body as { uid?: string; banned?: boolean };
  if (typeof uid !== "string" || !/^[a-zA-Z0-9_-]+$/.test(uid) || typeof banned !== "boolean") {
    return res.status(400).json({ error: "uid_and_banned_required" });
  }

  const ref = db.ref(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    return res.status(404).json({ error: "user_not_found" });
  }

  await ref.update({ banned });
  return res.json({ uid, banned });
}));


app.param(["doctorId", "commentId"], (req, res, next, value: string) => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) return res.status(400).json({ error: "invalid_id" });
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/schedule", asyncHandler(authMiddleware), asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user!.uid);
  if (!profile) return res.status(403).json({ error: "profile_missing" });
  const snapshot = await db.ref("consultationsDb").get();
  if (!snapshot.exists()) return res.status(503).json({ error: "schedule_not_initialized" });
  res.set("Cache-Control", "no-store");
  return res.json(visibleSchedule(snapshot.val(), profile));
}));

app.post("/schedule/actions", asyncHandler(authMiddleware), asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user!.uid);
  if (!profile || profile.role === "GUEST") return res.status(403).json({ error: "forbidden" });
  await commitScheduleAction(db.ref("consultationsDb"), profile, req.body,
    (raw, user, input, now) => applyScheduleAction(raw, user, input, now, process.env.SCHEDULE_TIME_ZONE || "Europe/Warsaw"));
  return res.json({ ok: true });
}));

app.put("/schedule", asyncHandler(authMiddleware), asyncHandler(requireAdmin), asyncHandler(async (req, res) => {
  // Explicit admin-only import for the existing backend migration control.
  if (!req.body || !Array.isArray(req.body.doctors) || !req.body.meta || req.body.meta.version !== 1) {
    return res.status(400).json({ error: "invalid_schedule_input" });
  }
  const imported = normalizeSchedule(req.body);
  imported.meta.updatedAt = new Date().toISOString();
  await db.ref("consultationsDb").set(imported);
  return res.json({ ok: true });
}));

const errorHandler: express.ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  if (error instanceof ScheduleError) return res.status(error.status).json({ error: error.code });
  if (error instanceof SyntaxError) return res.status(400).json({ error: "invalid_json" });
  console.error(error);
  return res.status(500).json({ error: "internal_error" });
};
app.use(errorHandler);

const port = Number(process.env.PORT || 3333);
app.listen(port, () => {
  console.log(`Auth server listening on http://localhost:${port}`);
});
