import { useCallback, useEffect, useState } from "react";

type NavigateOptions = {
  replace?: boolean;
};

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function parseLocation(target: string) {
  const url = new URL(target, window.location.origin);
  return {
    path: normalizePathname(url.pathname || "/"),
    search: url.search || "",
  };
}

export function useRouter() {
  const [path, setPath] = useState(() => normalizePathname(window.location.pathname || "/"));
  const [search, setSearch] = useState(() => window.location.search || "");

  useEffect(() => {
    const onPopState = () => {
      setPath(normalizePathname(window.location.pathname || "/"));
      setSearch(window.location.search || "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback(
    (to: string, options?: NavigateOptions) => {
      const next = parseLocation(to);
      if (next.path === path && next.search === search) return;
      if (options?.replace) {
        window.history.replaceState(null, "", `${next.path}${next.search}`);
      } else {
        window.history.pushState(null, "", `${next.path}${next.search}`);
      }
      setPath(next.path);
      setSearch(next.search);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [path, search]
  );

  return { path, search, navigate };
}
