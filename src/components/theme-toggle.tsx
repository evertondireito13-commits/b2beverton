import { useEffect, useState } from "react";
import { Moon, Sun, Sparkles } from "lucide-react";

export type ThemeName = "light" | "dark" | "noir";

const STORAGE_KEY = "bhm:theme";

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "noir");
  if (theme === "dark") root.classList.add("dark");
  if (theme === "noir") root.classList.add("noir");
}

export function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") return "noir";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "noir" || v === "light" ? v : "noir";
}

const OPTIONS: { value: ThemeName; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clara", icon: Sun },
  { value: "dark", label: "Escura", icon: Moon },
  { value: "noir", label: "Dark", icon: Sparkles },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    const t = getStoredTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const select = (t: ThemeName) => {
    setTheme(t);
    applyTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-card/70 p-0.5"
      role="group"
      aria-label="Tema visual"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            title={`Tema ${o.label}`}
            aria-pressed={active}
            className={
              "grid h-7 w-7 place-items-center rounded-full transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
