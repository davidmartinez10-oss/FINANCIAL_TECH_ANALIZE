import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BulletinView from "@/components/BulletinView";
import { loadBulletins } from "@/lib/bulletins";

export const dynamicParams = false; // solo existen las ediciones guardadas

export function generateStaticParams() {
  return loadBulletins().map((b) => ({ id: b.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const b = loadBulletins().find((x) => x.id === id);
  return { title: b ? `${b.title} · Macro Markets` : "Boletín siderúrgico" };
}

export default async function BoletinEdicionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const all = loadBulletins();
  const b = all.find((x) => x.id === id);
  if (!b) notFound();
  return <BulletinView bulletin={b} editions={all.map((x) => ({ id: x.id, number: x.number }))} />;
}
