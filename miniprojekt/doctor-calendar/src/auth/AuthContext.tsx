import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../firebaseConfig";
import type { AppUser, UserProfile, UserRole } from "../lib/types";
import { bootstrapMyProfile, fetchMyProfile } from "../lib/authzClient";

import { AuthContext, type AuthContextValue, type PersistenceMode } from "./useAuth";

const PERSISTENCE_STORAGE_KEY = "auth_persistence_mode";

function readPersistenceMode(): PersistenceMode {
  const stored = localStorage.getItem(PERSISTENCE_STORAGE_KEY);
  if (stored === "session" || stored === "none" || stored === "local") return stored;
  return "local";
}

function mapPersistence(mode: PersistenceMode) {
  switch (mode) {
    case "session":
      return browserSessionPersistence;
    case "none":
      return inMemoryPersistence;
    case "local":
    default:
      return browserLocalPersistence;
  }
}

function mapUser(user: FirebaseUser): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<UserRole>("GUEST");
  const [banned, setBanned] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [persistenceMode, setPersistenceModeState] = useState<PersistenceMode>(() => readPersistenceMode());
  const [persistenceBusy, setPersistenceBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setPersistenceBusy(true);
    setPersistence(auth, mapPersistence(persistenceMode))
      .catch((err) => {
        console.error("Unable to set authentication persistence:", err);
      })
      .finally(() => {
        if (active) setPersistenceBusy(false);
      });

    return () => {
      active = false;
    };
  }, [persistenceMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? mapUser(firebaseUser) : null);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const applyProfile = useCallback((profile: UserProfile | null) => {
    if (!profile) {
      setRole("GUEST");
      setBanned(false);
      setDoctorId(null);
      return;
    }
    setRole(profile.role);
    setBanned(profile.banned);
    setDoctorId(profile.doctorId ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      applyProfile(null);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const profile = await fetchMyProfile();
      applyProfile(profile);
    } catch (err) {
      console.error("Unable to load the authorization profile:", err);
      try {
        const profile = await bootstrapMyProfile();
        applyProfile(profile);
      } catch (bootstrapError) {
        console.error("Unable to initialize the profile:", bootstrapError);
        applyProfile(null);
        setProfileError("Unable to load your account permissions. Check that the authorization server is running, then retry.");
      }
    } finally {
      setProfileLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => {
    if (!user) {
      applyProfile(null);
      return;
    }
    void refreshProfile();
  }, [user, applyProfile, refreshProfile]);

  const setPersistenceMode = (mode: PersistenceMode) => {
    setPersistenceModeState(mode);
    localStorage.setItem(PERSISTENCE_STORAGE_KEY, mode);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      banned,
      doctorId,
      loading: !authReady || persistenceBusy || profileLoading,
      profileError,
      persistenceMode,
      persistenceBusy,
      setPersistenceMode,
      refreshProfile,
      register: async ({ email, password, displayName }) => {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(credential.user, { displayName });
          setUser(mapUser(credential.user));
        }
        try {
          const profile = await bootstrapMyProfile();
          applyProfile(profile);
        } catch (err) {
          console.error("Unable to initialize the profile:", err);
        }
      },
      login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
        await refreshProfile();
      },
      logout: async () => {
        await signOut(auth);
        applyProfile(null);
      },
    }),
    [
      user,
      role,
      banned,
      doctorId,
      authReady,
      persistenceMode,
      persistenceBusy,
      profileLoading,
      profileError,
      refreshProfile,
      applyProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
