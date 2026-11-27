import type { Metadata } from "next";
import BulletinView from "@/components/BulletinView";
import { loadBulletins } from "@/lib/bulletins";

export const metadata: Metadata = { title: "Boletín siderúrgico · Macro Markets" };

// Página estática: muestra la edición más reciente.
export default function BoletinPage() {
  const all = loadBulletins();
  return (
    <BulletinView bulletin={all[0]} editions={all.map((b) => ({ id: b.id, number: b.number }))} />
  );
}
