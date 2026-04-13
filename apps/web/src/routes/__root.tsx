import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { SunIcon, MoonIcon } from "@phosphor-icons/react";
import { IconButton } from "../components/ui/IconButton";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="fixed top-3 right-3 z-50">
        <IconButton
          onClick={() => setIsDark((d) => !d)}
          className="border border-border bg-surface p-2"
          aria-label={isDark ? "ライトモードに切り替え" : "ダークモードに切り替え"}
        >
          {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </IconButton>
      </div>
      <Outlet />
    </div>
  );
}
