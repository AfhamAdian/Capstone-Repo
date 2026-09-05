import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pulse.theme";

export type Theme = "light" | "dark";

/** Reads the stored choice, falling back to the OS setting. Mirrors the boot script in index.html. */
function readInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private mode or blocked site data — fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The theme choice, remembered across reloads. Without this the toggle was plain
 * `useState(false)`, so the app snapped back to light on every navigation-to-refresh.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice shouldn't break the toggle.
    }
  }, [theme]);

  // Follow the OS only while the person hasn't expressed a preference of their own.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
    if (stored === "light" || stored === "dark") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => setTheme(t => (t === "dark" ? "light" : "dark")), []);
  return { theme, dark: theme === "dark", toggle };
}
