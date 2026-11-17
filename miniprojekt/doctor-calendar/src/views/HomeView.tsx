export function HomeView() {
  return (
    <div style={{ maxWidth: 840, margin: "24px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Home</h2>
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        Manage medical appointments in one place. Browse doctors, book appointments,
        and manage schedules according to your user role.
      </p>
      <div style={{ marginTop: 16, padding: 12, background: "white", border: "1px solid #e2e2e2", borderRadius: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Getting Started</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#555" }}>
          <li>Sign in or create an account to access all features for your role.</li>
          <li>Patients can browse doctor schedules and book an appointment.</li>
          <li>Doctors can manage their schedules and availability.</li>
        </ul>
      </div>
    </div>
  );
}
