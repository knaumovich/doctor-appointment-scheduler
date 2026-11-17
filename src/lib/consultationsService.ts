import type {
  Absence,
  Appointment,
  AvailabilityRule,
  BroadcastMessage,
  PatientNotification,
} from "./types";
import { onValue, ref } from "firebase/database";
import { authFetch, fetchMyProfile } from "./authzClient";
import { applyScheduleAction } from "../../server/src/schedule";
import { database } from "../firebaseConfig";
import { getBackendSource } from "./backendSource";

export type DbOverride = {
  id: string; // appointmentId
  status: "CANCELED";
  cancelReason: string;
};

export type ConsultationsDb = {
  meta: { version: 1; updatedAt: string };
  doctors: Array<{ id: string; name: string; specialization: string }>;
  patients: Array<{ id: string; name: string }>;

  availabilityRules: AvailabilityRule[];
  absences: Absence[];

  appointments: Appointment[];        // seed/demo
  bookedAppointments: Appointment[];  // rezerwacje pacjentów (tworzone w UI)

  appointmentsOverrides: DbOverride[]; // anulowania systemowe (opcjonalnie)
  notifications: PatientNotification[];
  broadcasts: BroadcastMessage[];
};

const RTDB_PATH = "consultationsDb";
const LS_KEY = "consultationsDb_v1";
const HANDLE_DB = "consultationsFileHandleDb";
const HANDLE_STORE = "kv";
const HANDLE_KEY = "main";

function nowIso() {
  return new Date().toISOString();
}

type BookedAppointmentWithKey = Appointment & { __key?: string };

function normalizeBookedAppointments(
  raw: ConsultationsDb["bookedAppointments"] | Record<string, Appointment> | undefined
): Appointment[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, value]) => value && typeof value === "object")
      .map(([key, value]) => {
        const appt = value as BookedAppointmentWithKey;
        if (!appt.id) appt.id = key;
        appt.__key = key;
        return appt as Appointment;
      });
  }
  return [];
}

function normalizeBroadcasts(
  raw: ConsultationsDb["broadcasts"] | Record<string, BroadcastMessage> | undefined
): BroadcastMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, value]) => value && typeof value === "object")
      .map(([key, value]) => {
        const msg = value as BroadcastMessage;
        if (!msg.id) msg.id = key;
        return msg;
      });
  }
  return [];
}

function supportsFileApi(): boolean {
  return (
    typeof window !== "undefined" &&
    "showOpenFilePicker" in window &&
    "showSaveFilePicker" in window
  );
}

/** Minimalny IndexedDB KV store (dla FileSystemFileHandle). */
function idbGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const store = tx.objectStore(HANDLE_STORE);
      const g = store.get(key);
      g.onsuccess = () => resolve(g.result as T | undefined);
      g.onerror = () => reject(g.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbSet<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(HANDLE_STORE, "readwrite");
      const store = tx.objectStore(HANDLE_STORE);
      const p = store.put(value, key);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function readFromHandle(handle: FileSystemFileHandle): Promise<ConsultationsDb> {
  const perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    const req = await handle.requestPermission({ mode: "readwrite" });
    if (req !== "granted") throw new Error("Permission to access the JSON file was denied.");
  }
  const file = await handle.getFile();
  const text = await file.text();
  return JSON.parse(text) as ConsultationsDb;
}

async function writeToHandle(handle: FileSystemFileHandle, db: ConsultationsDb): Promise<void> {
  const perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    const req = await handle.requestPermission({ mode: "readwrite" });
    if (req !== "granted") throw new Error("Permission to write to the JSON file was denied.");
  }
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(db, null, 2));
  await writable.close();
}

function normalizeDb(db: ConsultationsDb): ConsultationsDb {
  return {
    ...db,
    meta: { version: 1, updatedAt: db.meta?.updatedAt ?? nowIso() },
    doctors: db.doctors ?? [],
    patients: db.patients ?? [],
    availabilityRules: db.availabilityRules ?? [],
    absences: db.absences ?? [],
    appointments: db.appointments ?? [],
    bookedAppointments: normalizeBookedAppointments(db.bookedAppointments),
    appointmentsOverrides: db.appointmentsOverrides ?? [],
    notifications: db.notifications ?? [],
    broadcasts: normalizeBroadcasts(db.broadcasts),
  };
}

async function loadTemplate(templateUrl: string): Promise<ConsultationsDb> {
  const r = await fetch(templateUrl);
  if (!r.ok) throw new Error(`Unable to load the database template: HTTP ${r.status}`);
  const db = (await r.json()) as ConsultationsDb;
  return normalizeDb(db);
}

async function readFromJsonBackend(
  templateUrl: string
): Promise<ConsultationsDb> {
  // 1) plik z dysku (jeśli był wcześniej wybrany)
  if (supportsFileApi()) {
    try {
      const handle = await idbGet<FileSystemFileHandle>(HANDLE_KEY);
      if (handle) return normalizeDb(await readFromHandle(handle));
    } catch {
      // ignoruj i idź dalej
    }
  }

  // 2) localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalizeDb(JSON.parse(raw) as ConsultationsDb);
  } catch {
    // ignore
  }

  // 3) template z public/
  return normalizeDb(await loadTemplate(templateUrl));
}

async function writeToJsonBackend(db: ConsultationsDb): Promise<void> {
  // Preferuj zapis do pliku
  if (supportsFileApi()) {
    let handle = await idbGet<FileSystemFileHandle>(HANDLE_KEY);
    if (!handle) {
      handle = await window.showSaveFilePicker({
        suggestedName: "consultations-db.json",
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      await idbSet(HANDLE_KEY, handle);
    }
    await writeToHandle(handle!, db);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch {
      // ignore
    }
    return;
  }

  // fallback: localStorage
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}


const CHANGE_EVENT = "consultations-data-changed";
let localQueue: Promise<unknown> = Promise.resolve();

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

async function loadForBackend(backend: "firebase" | "json", templateUrl: string): Promise<ConsultationsDb> {
  if (backend === "json") return readFromJsonBackend(templateUrl);
  return normalizeDb(await authFetch<ConsultationsDb>("/schedule"));
}

export const consultationsService = {
  async loadOrBootstrap(templateUrl = "/data/consultations-db.json") {
    return loadForBackend(getBackendSource(), templateUrl);
  },

  async action(command: Record<string, unknown>): Promise<void> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (getBackendSource() === "firebase") {
      await authFetch("/schedule/actions", { method: "POST", body: JSON.stringify({ ...command, timeZone }) });
    } else {
      const profile = await fetchMyProfile();
      const perform = async () => {
        const db = await readFromJsonBackend("/data/consultations-db.json");
        const updated = applyScheduleAction(db, profile, { ...command, timeZone }, Date.now(), timeZone);
        await writeToJsonBackend(normalizeDb(updated as unknown as ConsultationsDb));
      };
      // Serialize same-origin local edits when Web Locks are available.
      const run = async () => { if (navigator.locks) await navigator.locks.request(LS_KEY, perform); else await perform(); };
      const pending = localQueue.then(run, run);
      localQueue = pending.catch(() => undefined);
      await pending;
    }
    notify();
  },

  addBookedAppointment(appointment: Appointment) {
    return this.action({ action: "book", appointment });
  },
  cancelBookedAppointment(id: string, reason: string) {
    return this.action({ action: "cancel", id, reason });
  },
  markAppointmentsPaid(ids: string[]) {
    return this.action({ action: "pay", ids });
  },
  addRule(rule: AvailabilityRule) {
    return this.action({ action: "addRule", rule });
  },
  removeRule(id: string, doctorId: string) {
    return this.action({ action: "removeRule", id, doctorId });
  },
  clearRules(doctorId: string) {
    return this.action({ action: "clearRules", doctorId });
  },
  addAbsence(absence: Absence) {
    return this.action({ action: "addAbsence", absence });
  },
  removeAbsence(id: string, doctorId: string) {
    return this.action({ action: "removeAbsence", id, doctorId });
  },
  addBroadcast(broadcast: BroadcastMessage) {
    return this.action({ action: "broadcast", broadcast: { ...broadcast, id: crypto.randomUUID() } });
  },

  subscribe(onChange: (db: ConsultationsDb) => void, onError?: (error: Error) => void): () => void {
    let active = true;
    let request = 0;
    const backend = getBackendSource();
    const load = () => {
      const current = ++request;
      void loadForBackend(backend, "/data/consultations-db.json")
        .then(db => { if (active && current === request) onChange(db); })
        .catch(error => { if (active && current === request) onError?.(error instanceof Error ? error : new Error(String(error))); });
    };
    load();
    window.addEventListener(CHANGE_EVENT, load);
    const onStorage = (event: StorageEvent) => { if (event.key === LS_KEY) load(); };
    window.addEventListener("storage", onStorage);
    // Only the non-sensitive revision is read directly; the API filters the actual data.
    const unsubscribe = backend === "firebase"
      ? onValue(ref(database, RTDB_PATH + "/meta"), load, error => { if (active) onError?.(error); })
      : () => {};
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(CHANGE_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  },
};

export async function migrateBackend(from: "firebase" | "json", to: "firebase" | "json"): Promise<void> {
  if (from === to) return;
  const data = await loadForBackend(from, "/data/consultations-db.json");
  if (to === "json") await writeToJsonBackend(data);
  else await authFetch("/schedule", { method: "PUT", body: JSON.stringify(data) });
  notify();
}
