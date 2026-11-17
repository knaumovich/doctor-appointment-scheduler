import { useMemo, useState } from "react";
import { errorMessage } from "../lib/errors";
import type { Appointment, ConsultType } from "../lib/types";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function durationMin(a: Appointment) {
  const s = new Date(a.start).getTime();
  const e = new Date(a.end).getTime();
  return Math.max(0, Math.round((e - s) / 60000));
}

function labelType(t: ConsultType) {
  switch (t) {
    case "FIRST_VISIT": return "Initial Consultation";
    case "FOLLOW_UP": return "Follow-up";
    case "CHRONIC": return "Chronic Care";
    case "PRESCRIPTION": return "Prescription";
    case "ONLINE": return "Online";
    case "DOCUMENTS": return "Documents / Test Results";
    default: return String(t);
  }
}

const PRICE_PER_30: Record<string, number> = {
  FIRST_VISIT: 120,
  FOLLOW_UP: 90,
  CHRONIC: 90,
  PRESCRIPTION: 60,
  ONLINE: 70,
  DOCUMENTS: 50,
};

function pricePLN(a: Appointment) {
  const per30 = PRICE_PER_30[a.type] ?? 90;
  const slots = Math.max(1, Math.ceil(durationMin(a) / 30));
  return per30 * slots;
}

export function Cart({
  open,
  items,
  onClose,
  onRemove,
  onPay,
}: {
  open: boolean;
  items: Appointment[];
  onClose: () => void;
  onRemove: (id: string) => Promise<void>;
  onPay: (ids: string[]) => Promise<void>;
}) {
  const visible = useMemo(() => {
    // w koszyku pokazuj tylko te, które nie są anulowane
    return items
      .filter((a) => a.status === "BOOKED")
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [items]);

  const unpaidIds = useMemo(
    () => visible.filter((a) => !a.paid).map((a) => a.id),
    [visible]
  );

  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<"CARD" | "BLIK">("CARD");
  const [card, setCard] = useState("");
  const [blik, setBlik] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paidOk, setPaidOk] = useState(false);

  const selectedItems = useMemo(
    () => visible.filter((a) => selected.includes(a.id) && !a.paid),
    [visible, selected]
  );

  const total = useMemo(() => selectedItems.reduce((sum, a) => sum + pricePLN(a), 0), [selectedItems]);

  const canPay = useMemo(() => {
    if (processing) return false;
    if (selectedItems.length === 0) return false;
    if (method === "CARD") return /^\d{16}$/.test(card.replace(/\s+/g, ""));
    return /^\d{6}$/.test(blik.replace(/\s+/g, ""));
  }, [processing, selectedItems.length, method, card, blik]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (!processing && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          background: "white",
          border: "1px solid #ddd",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #eee", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Cart – Booked Appointments</div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
            Unpaid: <b>{unpaidIds.length}</b>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: "auto" }}>
          {error && <div role="alert" style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}
          {visible.length === 0 ? (
            <div style={{ color: "#666", fontSize: 13 }}>No booked appointments in your cart.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setSelected(unpaidIds)}
                  disabled={unpaidIds.length === 0}
                >
                  Select All Unpaid
                </button>
                <button type="button" onClick={() => setSelected([])}>
                  Clear Selection
                </button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {visible.map((a) => {
                  const dMin = durationMin(a);
                  const p = pricePLN(a);
                  const isUnpaid = !a.paid;

                  return (
                    <div
                      key={a.id}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 14,
                        padding: 12,
                        display: "grid",
                        gridTemplateColumns: "28px minmax(0,1fr) auto",
                        gap: 12,
                        alignItems: "start",
                        opacity: a.paid ? 0.65 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        disabled={!isUnpaid || processing}
                        onChange={(e) => {
                          setPaidOk(false);
                          setSelected((prev) =>
                            e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)
                          );
                        }}
                        style={{ marginTop: 3 }}
                      />

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>
                          {labelType(a.type)}{" "}
                          {a.paid && <span style={{ fontWeight: 900, color: "#1b6" }}>• PAID</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
                          <b>Start:</b> {fmtDateTime(a.start)} • <b>End:</b> {fmtDateTime(a.end)} •{" "}
                          <b>Duration:</b> {dMin} min
                        </div>
                        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                          <b>Patient:</b> {a.patient?.name ?? "—"}{" "}
                          {(a.documents?.length ?? 0) > 0 && (
                            <>
                              • <b>Documents:</b> {a.documents!.join(", ")}
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                        <div style={{ fontWeight: 900 }}>{p} PLN</div>
                        <button type="button" disabled={processing} onClick={async () => {
                          setProcessing(true);
                          setError(null);
                          try { await onRemove(a.id); }
                          catch (error) { setError(errorMessage(error)); }
                          finally { setProcessing(false); }
                        }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* PAYMENT */}
        <div style={{ borderTop: "1px solid #eee", padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>Payment (Simulation)</div>
            <div style={{ marginLeft: "auto", fontSize: 13 }}>
              Selected Total: <b>{total} PLN</b>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              gap: 12,
            }}
          >
            <label style={{ display: "grid", gap: 6, fontSize: 12, minWidth: 0 }}>
              <span style={{ fontWeight: 800 }}>Method</span>
              <select
                disabled={processing}
                value={method}
                onChange={(e) => {
                  setPaidOk(false);
                  setMethod(e.target.value as "CARD" | "BLIK");
                }}
                style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" }}
              >
                <option value="CARD">Card</option>
                <option value="BLIK">BLIK</option>
              </select>
            </label>

            {method === "CARD" ? (
              <label style={{ display: "grid", gap: 6, fontSize: 12, minWidth: 0 }}>
                <span style={{ fontWeight: 800 }}>Card Number (16 digits)</span>
                <input
                  value={card}
                  disabled={processing}
                  onChange={(e) => {
                    setPaidOk(false);
                    setCard(e.target.value);
                  }}
                  placeholder="1234 5678 9012 3456"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" }}
                />
              </label>
            ) : (
              <label style={{ display: "grid", gap: 6, fontSize: 12, minWidth: 0 }}>
                <span style={{ fontWeight: 800 }}>BLIK Code (6 digits)</span>
                <input
                  value={blik}
                  disabled={processing}
                  onChange={(e) => {
                    setPaidOk(false);
                    setBlik(e.target.value);
                  }}
                  placeholder="123456"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" }}
                />
              </label>
            )}
          </div>

          {paidOk && (
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(0,180,90,0.25)",
                background: "#eefbf3",
                color: "#0a6",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              Payment successful ✓
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={onClose} disabled={processing}>
              Close
            </button>
            <button
              type="button"
              disabled={!canPay}
              onClick={async () => {
                setProcessing(true);
                setError(null);
                setPaidOk(false);

                try {
                  await new Promise(resolve => setTimeout(resolve, 1200));
                  const ids = selectedItems.map((x) => x.id);
                  await onPay(ids);
                  setPaidOk(true);
                  setSelected([]);
                  setCard("");
                  setBlik("");
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setProcessing(false);
                }
              }}
              style={{
                fontWeight: 900,
                opacity: canPay ? 1 : 0.5,
                cursor: canPay ? "pointer" : "not-allowed",
              }}
            >
              {processing ? "Processing…" : "Pay"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
