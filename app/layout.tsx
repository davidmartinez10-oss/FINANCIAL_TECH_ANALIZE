import type { Metadata } from "next";
import localFont from "next/font/local";
import Nav from "@/components/Nav";
import TickerBar from "@/components/TickerBar";
import "./globals.css";

// Fuentes servidas desde el propio proyecto (paquetes @fontsource-variable).
// Antes se descargaban de Google Fonts durante el build con `next/font/google`,
// y el build fallaba cada vez que Google respondía con un formato de URL
// distinto ("Cannot read properties of null" en el cargador de fuentes).
const sans = localFont({
  src: "../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  display: "swap",
  variable: "--font-sans",
  weight: "200 800",
});

const mono = localFont({
  src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  display: "swap",
  variable: "--font-mono",
  weight: "100 800",
});

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
    <html lang="es" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado antes de pintar, para que no parpadee. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("mm-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}',
          }}
        />
      </head>
      <body>
        {/* Capa de textura ambiental fija (grano + orbes) */}
        <div className="ambient" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <Nav />
        <TickerBar />
        {children}
      </body>
    </html>
  );
}
