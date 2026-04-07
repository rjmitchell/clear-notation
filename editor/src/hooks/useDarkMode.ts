import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "cn-theme";

/**
 * Hook for dark mode state. Reads initial preference from localStorage
 * or the system `prefers-color-scheme` media query. Updates the
 * `data-theme` attribute on `<html>` and persists changes.
 */
export function useDarkMode() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark") return true;
      if (saved === "light") return false;
    } catch {
      // localStorage unavailable
    }
    // Default to system preference
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  // Apply theme attribute and persist
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light"
    );
    try {
      localStorage.setItem(STORAGE_KEY, darkMode ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  return { darkMode, toggleDarkMode };
}
