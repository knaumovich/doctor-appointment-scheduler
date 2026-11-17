import { createContext, useContext } from "react";
import type { AppUser, UserRole } from "../lib/types";
export type PersistenceMode = "local" | "session" | "none";

type RegisterInput = {
  email: string;
  password: string;
  displayName?: string;
};

export type AuthContextValue = {
  user: AppUser | null;
  role: UserRole;
  banned: boolean;
  doctorId?: string | null;
  loading: boolean;
  profileError: string | null;
  persistenceMode: PersistenceMode;
  persistenceBusy: boolean;
  setPersistenceMode: (mode: PersistenceMode) => void;
  refreshProfile: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
