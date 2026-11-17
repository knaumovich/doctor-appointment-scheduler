import { useMemo } from "react";
import { useAuth } from "../auth/useAuth";
import { useAppointmentOverrides } from "../lib/useAppointmentOverrides";
import { useRouter } from "../lib/router";
import { Cart } from "../components/Cart";

export function CartView() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const { getBookedResolved, removeBookedAppointment, markAppointmentsPaid, error } = useAppointmentOverrides(user?.uid);

  const items = useMemo(() => getBookedResolved(), [getBookedResolved]);

  return (
    <div style={{ padding: 16 }}>
      {error && <div role="alert" style={{ color: "#b00020" }}>Unable to load your appointments. Check the backend connection and refresh.</div>}
      <Cart
        open={!error}
        items={items}
        onClose={() => navigate("/schedules")}
        onRemove={removeBookedAppointment}
        onPay={(ids) => markAppointmentsPaid(ids)}
      />
    </div>
  );
}
