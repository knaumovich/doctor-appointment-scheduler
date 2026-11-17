import { useAuth } from "../auth/useAuth";
import { can } from "../lib/roles";

type TopNavProps = {
  path: string;
  onNavigate: (to: string) => void;
};

function NavButton({
  active,
  label,
  onClick,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nav-btn"
      data-active={active ? "true" : "false"}
    >
      {label}
    </button>
  );
}

export function TopNav({ path, onNavigate }: TopNavProps) {
  const { user, role, logout } = useAuth();
  const displayName = user?.displayName || user?.email || "User";
  const isAdmin = role === "ADMIN";

  return (
    <div
      className="top-nav"
    >
      <div className="top-nav__inner">
        <div className="top-nav__left">
          <NavButton label="Home" active={path === "/" || path === "/home"} onClick={() => onNavigate("/")} />
          {can(role, "viewDoctorsList") && (
            <NavButton label="Doctors" active={path === "/doctors"} onClick={() => onNavigate("/doctors")} />
          )}
          {role === "PATIENT" && (
            <NavButton
              label="Doctor Schedules"
              active={path === "/schedules" || path === "/doctor"}
              onClick={() => onNavigate("/schedules")}
            />
          )}
          {role === "DOCTOR" && (
            <>
              <NavButton label="My Schedule" active={path === "/doctor"} onClick={() => onNavigate("/doctor")} />
              <NavButton
                label="Manage Schedule"
                active={path === "/doctor/manage"}
                onClick={() => onNavigate("/doctor/manage")}
              />
            </>
          )}
          {isAdmin && <NavButton label="Admin Panel" active={path === "/admin"} onClick={() => onNavigate("/admin")} />}
        </div>

        <div className="top-nav__right">
          {role === "PATIENT" && (
            <NavButton
              label="My Cart"
              active={path === "/cart"}
              onClick={() => onNavigate("/cart")}
            />
          )}
          {!user ? (
            <>
              <NavButton label="Register" active={path === "/register"} onClick={() => onNavigate("/register")} />
              <NavButton label="Sign In" active={path === "/login"} onClick={() => onNavigate("/login")} />
            </>
          ) : (
            <>
              <span className="top-nav__user">Signed in: {displayName}</span>
              <NavButton
                label="Sign Out"
                onClick={async () => {
                  await logout();
                  onNavigate("/login");
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
