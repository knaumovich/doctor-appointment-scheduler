import { useSyncExternalStore } from "react";

export type BackendSource = "firebase" | "json";

const STORAGE_KEY = "backend_source_v1";
const DEFAULT_BACKEND: BackendSource = "firebase";

let cached: BackendSource | null = null;
const listeners = new Set<() => void>();

function isBackendSource(value: string): value is BackendSource {
  return value === "firebase" || value === "json";
}

function readStored(): BackendSource {
  if (typeof window === "undefined") return DEFAULT_BACKEND;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && isBackendSource(raw)) return raw;
  return DEFAULT_BACKEND;
}

export function getBackendSource(): BackendSource {
  if (!cached) cached = readStored();
  return cached;
}

export function setBackendSource(next: BackendSource): void {
  if (!isBackendSource(next)) return;
  const current = getBackendSource();
  if (next === current) return;
  cached = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  listeners.forEach((fn) => fn());
}

export function subscribeBackendSource(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackendSource(): BackendSource {
  return useSyncExternalStore(subscribeBackendSource, getBackendSource, getBackendSource);
}
