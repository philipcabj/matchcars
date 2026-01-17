// app/contexts/ThemeContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  ReactNode,
  useEffect,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Theme, darkTheme, lightTheme } from "../config/theme";

type ThemeName = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  toggleTheme: () => void;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>("dark");
  const STORAGE_KEY = "@themeName";

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "light" || value === "dark") {
          setThemeName(value as ThemeName);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, themeName).catch(() => {});
  }, [themeName]);

  const value = useMemo(
    () => ({
      themeName,
      theme: themeName === "dark" ? darkTheme : lightTheme,
      toggleTheme: () =>
        setThemeName((prev) => (prev === "dark" ? "light" : "dark")),
      setThemeName,
    }),
    [themeName]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
