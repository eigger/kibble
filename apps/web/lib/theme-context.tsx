"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT_COLOR,
  applyAccentColor,
  isAccentColor,
  type AccentColor,
} from "./accent-colors";

export type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "kibble_theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accentColor: AccentColor;
  setAccentColor: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function readThemeColorMetaValue(theme: Theme): string {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const varName = resolved === "dark" ? "--color-bg" : "--color-primary";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function syncThemeColorMeta(theme: Theme) {
  const value = readThemeColorMetaValue(theme);
  if (value) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [accentColor, setAccentColorState] = useState<AccentColor>(DEFAULT_ACCENT_COLOR);

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      setThemeState(storedTheme);
    }

    const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentColor(storedAccent)) {
      setAccentColorState(storedAccent);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    syncThemeColorMeta(theme);
  }, [theme]);

  useEffect(() => {
    applyAccentColor(accentColor);
    syncThemeColorMeta(theme);
  }, [accentColor, theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      syncThemeColorMeta(theme);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    syncThemeColorMeta(next);
  }

  function setAccentColor(next: AccentColor) {
    setAccentColorState(next);
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
    applyAccentColor(next);
    syncThemeColorMeta(theme);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
