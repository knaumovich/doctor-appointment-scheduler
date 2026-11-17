export function DayHeader({ date, bookedCount, isToday }: { date: Date; bookedCount: number; isToday: boolean }) {
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");

  return (
    <div style={{ padding: "8px 10px", fontSize: 13 }}>
      <div style={{ fontWeight: 700 }}>
        {dow} {dd}/{mm} {isToday ? "– today" : ""}
      </div>
      <div style={{ fontSize: 12, color: "#555" }}>
        Booked: <b>{bookedCount}</b>
      </div>
    </div>
  );
}
