import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";

type LoginViewProps = {
  onSuccess?: () => void;
};

export function LoginView({ onSuccess }: LoginViewProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      onSuccess?.();
    } catch (err) {
      console.error(err);
      setError("Unable to sign in. Check your credentials and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "32px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>Sign In</h2>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#555" }}>E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#555" }}>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <div style={{ color: "#b00020", fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ fontWeight: 700 }}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
