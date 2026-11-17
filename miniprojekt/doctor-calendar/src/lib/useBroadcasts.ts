import { useConsultationsDb } from "./useConsultationsDb";
export function useBroadcasts(doctorId?: string) {
  const { data } = useConsultationsDb();
  const broadcasts = (data?.broadcasts ?? []).filter(b => !doctorId || b.doctorId === doctorId);
  return { broadcasts: [...broadcasts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}
