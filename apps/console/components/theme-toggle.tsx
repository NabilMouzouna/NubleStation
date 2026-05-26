"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = document.documentElement.classList.toggle("dark");
    setDark(next);
    try {
      localStorage.setItem("nuble-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {dark ? <Sun size={13} /> : <Moon size={13} />}
      {dark ? "Light" : "Dark"}
    </button>
  );
}
