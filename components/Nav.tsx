"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/company", label: "Compañías" },
  { href: "/macro", label: "Macro" },
  { href: "/news", label: "Noticias" },
  { href: "/assistant", label: "Asistente IA" },
];

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
    </nav>
  );
}
