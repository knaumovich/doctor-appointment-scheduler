import { useEffect, useState, type FormEvent } from "react";
import { adminListUsers, adminRegisterDoctor, adminSetBan } from "../lib/authzClient";
import { setBackendSource, useBackendSource, type BackendSource } from "../lib/backendSource";
import { migrateBackend } from "../lib/consultationsService";
import type { UserProfile } from "../lib/types";
import { useAuth } from "../auth/useAuth";

export function AdminView() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [doctorId, setDoctorId] = useState("d1");
  const [busy, setBusy] = useState(false);
  const backend = useBackendSource();
  const [isMigrating, setIsMigrating] = useState(false);
  const { persistenceMode, setPersistenceMode, persistenceBusy } = useAuth();

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminListUsers();
      setUsers(list);
    } catch (err) {
      console.error(err);
      setError("Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const onRegisterDoctor = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminRegisterDoctor({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        doctorId: doctorId.trim() || undefined,
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setDoctorId("d1");
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError("Unable to register the doctor.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBan = async (user: UserProfile) => {
    setBusy(true);
    setError(null);
    try {
      await adminSetBan({ uid: user.uid, banned: !user.banned });
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError("Unable to update the restriction status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "24px auto", padding: 16, display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ marginBottom: 4 }}>Admin Panel</h2>
        <div style={{ fontSize: 13, color: "#666" }}>
          Manage users, register doctors, and restrict reviews and ratings.
        </div>
      </div>

      <form
        onSubmit={onRegisterDoctor}
        style={{ border: "1px solid #e2e2e2", padding: 12, borderRadius: 10, background: "white" }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Register a Doctor</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#555" }}>Full Name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#555" }}>Doctor ID</span>
            <input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} placeholder="d1" />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#555" }}>E-mail</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#555" }}>Temporary Password</span>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </label>
        </div>
        <button type="submit" disabled={busy} style={{ marginTop: 8, fontWeight: 700 }}>
          {busy ? "Creating…" : "Create Doctor Account"}
        </button>
      </form>

      <div style={{ border: "1px solid #e2e2e2", padding: 12, borderRadius: 10, background: "white" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Data Source</div>
        <label style={{ display: "grid", gap: 6, maxWidth: 360 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Schedule Storage</span>
          <select
            value={backend}
            onChange={async (e) => {
              const next = e.target.value as BackendSource;
              if (next === backend) return;
              setIsMigrating(true);
              try {
                await migrateBackend(backend, next);
                setBackendSource(next);
              } catch (err) {
                console.error(err);
                setError("Data migration failed.");
              } finally {
                setIsMigrating(false);
              }
            }}
            style={{ padding: "6px 8px" }}
            disabled={isMigrating || busy}
          >
            <option value="json">JSON (file / localStorage)</option>
            <option value="firebase">Firebase (Realtime Database)</option>
          </select>
        </label>
        <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>
          {isMigrating ? "Migrating data…" : "Switching copies data to the selected storage backend."}
        </div>
      </div>

      <div style={{ border: "1px solid #e2e2e2", padding: 12, borderRadius: 10, background: "white" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Sign-in Persistence</div>
        <label style={{ display: "grid", gap: 6, maxWidth: 320 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Persistence Mode</span>
          <select
            value={persistenceMode}
            onChange={(e) => setPersistenceMode(e.target.value as typeof persistenceMode)}
            disabled={persistenceBusy || busy}
            style={{ padding: "6px 8px" }}
          >
            <option value="local">Stay signed in</option>
            <option value="session">Current session only</option>
            <option value="none">Until page reload</option>
          </select>
        </label>
        <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>
          This setting applies to this browser and determines whether you stay signed in after refreshing.
        </div>
      </div>

      <div style={{ border: "1px solid #e2e2e2", padding: 12, borderRadius: 10, background: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Users</div>
          <button type="button" onClick={loadUsers} disabled={loading || busy}>
            Refresh
          </button>
        </div>
        {error && <div style={{ color: "#b00020", marginTop: 8 }}>{error}</div>}
        {loading ? (
          <div style={{ marginTop: 8 }}>Loading…</div>
        ) : (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {users.map((user) => (
              <div
                key={user.uid}
                style={{
                  display: "grid",
                  gap: 6,
                  gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                  alignItems: "center",
                  borderBottom: "1px solid #f0f0f0",
                  paddingBottom: 6,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{user.displayName || user.email || user.uid}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{user.email}</div>
                </div>
                <div style={{ fontSize: 12 }}>Role: {{ GUEST: "Guest", PATIENT: "Patient", DOCTOR: "Doctor", ADMIN: "Administrator" }[user.role]}</div>
                <div style={{ fontSize: 12 }}>Doctor ID: {user.doctorId ?? "-"}</div>
                <div style={{ fontSize: 12 }}>{user.banned ? "Restricted" : "Active"}</div>
                <button type="button" disabled={busy} onClick={() => toggleBan(user)}>
                  {user.banned ? "Unrestrict" : "Restrict"}
                </button>
              </div>
            ))}
            {users.length === 0 && <div style={{ fontSize: 12, color: "#666" }}>No users found.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
