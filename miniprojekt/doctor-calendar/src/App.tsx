import { useEffect, useMemo } from "react";
import { useAuth } from "./auth/useAuth";
import { TopNav } from "./components/TopNav";
import { useRouter } from "./lib/router";
import { can } from "./lib/roles";
import { AdminView } from "./views/AdminView";
import { DoctorView } from "./views/DoctorView";
import { DoctorsListView } from "./views/DoctorsListView";
import { HomeView } from "./views/HomeView";
import { CartView } from "./views/CartView";
import { SchedulesListView } from "./views/SchedulesListView";
import { LoginView } from "./views/LoginView";
import { RegisterView } from "./views/RegisterView";

export default function App() {
  const { path, search, navigate } = useRouter();
  const { user, role, loading, profileError, refreshProfile } = useAuth();
  const canViewSchedules = can(role, "viewSchedules");
  const isAdmin = role === "ADMIN";
  const isDoctor = role === "DOCTOR";

  const defaultPath = isAdmin ? "/admin" : isDoctor ? "/doctor" : role === "PATIENT" ? "/schedules" : "/doctors";
  const doctorIdParam = new URLSearchParams(search).get("doctorId");

  useEffect(() => {
    if (loading) return;

    if (path === "/home") {
      navigate("/", { replace: true });
      return;
    }

    if (!user && (path === "/doctor" || path === "/doctor/manage" || path === "/admin")) {
      navigate("/login", { replace: true });
      return;
    }
    if (!user && path === "/cart") {
      navigate("/login", { replace: true });
      return;
    }

    if (path === "/doctor" && role === "PATIENT" && !doctorIdParam) {
      navigate("/schedules", { replace: true });
      return;
    }

    if (path === "/doctors" && !can(role, "viewDoctorsList")) {
      navigate(defaultPath, { replace: true });
      return;
    }

    if (path === "/schedules" && role !== "PATIENT") {
      navigate(defaultPath, { replace: true });
      return;
    }
    if (path === "/cart" && role !== "PATIENT") {
      navigate(defaultPath, { replace: true });
      return;
    }
    if (path === "/doctor/manage" && role !== "DOCTOR") {
      navigate(defaultPath, { replace: true });
      return;
    }

    if (path === "/doctor" && !canViewSchedules) {
      navigate(defaultPath, { replace: true });
      return;
    }
    if (path === "/doctor/manage" && !can(role, "editSchedule")) {
      navigate(defaultPath, { replace: true });
      return;
    }

    if (path === "/admin" && !isAdmin) {
      navigate(defaultPath, { replace: true });
      return;
    }

    if ((path === "/login" || path === "/register") && user) {
      navigate(defaultPath, { replace: true });
    }
  }, [path, user, loading, navigate, canViewSchedules, isAdmin, defaultPath, doctorIdParam, role]);

  const content = useMemo(() => {
    if (loading) {
      return <div style={{ padding: 16 }}>Checking session…</div>;
    }

    switch (path) {
      case "/":
        return <HomeView />;
      case "/home":
        return <HomeView />;
      case "/schedules":
        if (role !== "PATIENT") return <div style={{ padding: 16 }}>You do not have permission to view this page.</div>;
        return <SchedulesListView />;
      case "/cart":
        if (!user) return <div style={{ padding: 16 }}>Please sign in to continue.</div>;
        if (role !== "PATIENT") return <div style={{ padding: 16 }}>You do not have permission to view this page.</div>;
        return <CartView />;
      case "/doctors":
        return <DoctorsListView />;
      case "/login":
        return <LoginView onSuccess={() => navigate("/")} />;
      case "/register":
        return <RegisterView onSuccess={() => navigate("/")} />;
      case "/doctor":
        if (!user) return <div style={{ padding: 16 }}>Please sign in to continue.</div>;
        if (!canViewSchedules) return <div style={{ padding: 16 }}>You do not have permission to view this page.</div>;
        return <DoctorView variant={role === "DOCTOR" ? "VIEW" : "DEFAULT"} />;
      case "/doctor/manage":
        if (!user) return <div style={{ padding: 16 }}>Please sign in to continue.</div>;
        if (role !== "DOCTOR") return <div style={{ padding: 16 }}>You do not have permission to view this page.</div>;
        return <DoctorView variant="MANAGE" />;
      case "/admin":
        if (!user) return <div style={{ padding: 16 }}>Please sign in to continue.</div>;
        if (!isAdmin) return <div style={{ padding: 16 }}>You do not have permission to view this page.</div>;
        return <AdminView />;
      default:
        return (
          <div style={{ padding: 16 }}>
            Page not found. Return to <b>{defaultPath}</b>.
          </div>
        );
    }
  }, [loading, path, navigate, defaultPath, user, canViewSchedules, isAdmin, role]);

  return (
    <div className="app-root">
      <TopNav path={path} onNavigate={(to) => navigate(to)} />
      {user && profileError && (
        <div role="alert" style={{ padding: 16, color: "#b00020" }}>
          {profileError} <button onClick={() => void refreshProfile()}>Retry</button>
        </div>
      )}
      <main className="app-main">{content}</main>
    </div>
  );
}
