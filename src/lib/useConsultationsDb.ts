import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { consultationsService, type ConsultationsDb } from "./consultationsService";
import { useBackendSource } from "./backendSource";

export function useConsultationsDb() {
  const backend = useBackendSource();
  const { user } = useAuth();
  const key = backend + ":" + (user?.uid ?? "");
  const [state, setState] = useState<{ key: string; data?: ConsultationsDb; error?: Error }>({ key: "" });
  useEffect(() => {
    if (!user?.uid) return;
    return consultationsService.subscribe(
      data => setState({ key, data }),
      error => setState({ key, error }),
    );
  }, [key, user?.uid]);
  return state.key === key ? state : { key };
}
