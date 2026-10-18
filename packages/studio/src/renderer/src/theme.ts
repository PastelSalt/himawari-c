/**
 * Studio's light and dark themes (Settings → Appearance). The colors are CSS
 * tokens in styles.css; this sets `data-theme` on <html> from the setting,
 * following Windows when it's "system". The main process sets
 * nativeTheme.themeSource to the same value, so menus, scrollbars, and
 * `prefers-color-scheme` agree.
 */
import { useEffect, useState } from "react";
import type { Appearance } from "../../shared/api";
import { useStudio } from "./store";

export type ResolvedTheme = "light" | "dark";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(a: Appearance, systemDark: boolean): ResolvedTheme {
  return a === "system" ? (systemDark ? "dark" : "light") : a;
}

/** The theme in effect; keeps <html data-theme> in sync. */
export function useTheme(): ResolvedTheme {
  const appearance = useStudio((s) => s.settings?.appearance ?? "light");
  const [systemDark, setSystemDark] = useState(() => query().matches);
  useEffect(() => {
    const q = query();
    const on = () => setSystemDark(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [appearance]);
  const theme = resolveTheme(appearance, systemDark);
  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);
  return theme;
}

/** A theme token's current value (for canvases and SVG attributes that can't use var()). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
