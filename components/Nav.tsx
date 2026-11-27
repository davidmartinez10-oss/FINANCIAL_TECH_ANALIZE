"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/company", label: "Compañías" },
  { href: "/macro", label: "Macro y PIB" },
  { href: "/siderurgia", label: "Siderurgia" },
  { href: "/news", label: "Noticias" },
  { href: "/assistant", label: "Asistente IA" },
];

type Theme = "light" | "dark";

// El tema se guarda en el navegador; si el almacenamiento no está disponible
// (modo privado, vista embebida) el interruptor sigue funcionando en memoria.
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("mm-theme", next);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={theme === "dark"}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {theme === "dark" ? "Tema claro" : "Tema oscuro"}
    </button>
  );
}

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="nav-logo">▲</span> Macro Markets
      </div>
      <div className="nav-links">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link${pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href)) ? " active" : ""}`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <ThemeToggle />
    </nav>
  );
}
