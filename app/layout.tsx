import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macro Markets · Análisis de Inversión",
  description:
    "Plataforma de análisis macro/micro y mercado en tiempo real con pronósticos ensamblados (Prophet · ARIMAX · XGBoost) y validación Monte Carlo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
