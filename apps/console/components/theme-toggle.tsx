"use client";

import { useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = document.documentElement.classList.toggle("dark");
    setDark(next);
    // Cookie (not localStorage) so the server component in layout.tsx can read
    // the preference and render the correct class — prevents React stripping it.
    document.cookie = `nuble-theme=${next ? "dark" : "light"};path=/;max-age=31536000;SameSite=Lax`;
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
