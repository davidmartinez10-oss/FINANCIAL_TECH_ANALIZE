import Link from "next/link";
import type { Bulletin } from "@/lib/bulletins";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const edLabel = (id: string) => {
  const [y, m] = id.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Una edición del boletín. Componente de servidor: se genera al compilar.
export default function BulletinView({
  bulletin: b,
  editions,
}: {
  bulletin: Bulletin;
  editions: { id: string; number: number }[];
}) {
  const sources = new Map(b.sources.map((s) => [s.id, s]));
  return (
    <main className="container bl">
      <header className="topbar">
        <div>
          <div className="bl-kicker">
            Boletín siderúrgico · edición n.º {b.number} · publicado el {fmtDay(b.published)}
          </div>
          <h1>{b.title}</h1>
          <p className="bl-headline">{b.headline}</p>
        </div>
      </header>

      {editions.length > 1 && (
        <nav className="bl-editions" aria-label="Ediciones">
          {editions.map((e) => (
            <Link key={e.id} href={`/boletin/${e.id}`} className={`tab${e.id === b.id ? " active" : ""}`}>
              n.º {e.number} · {edLabel(e.id)}
            </Link>
          ))}
        </nav>
      )}

      <section>
        <h2 className="section-title">Lo esencial</h2>
        <ol className="bl-points card">
          {b.keyPoints.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="section-title">Cifras del mes</h2>
        <div className="card bl-table-wrap">
          <table className="sd-table sd-table-tight">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="num">Valor</th>
                <th>Unidad</th>
                <th>Variación</th>
                <th>Período</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {b.indicators.map((i) => {
                const s = sources.get(i.sourceId)!;
                return (
                  <tr key={i.label}>
                    <td>{i.label}</td>
                    <td className="num bl-val">{i.value}</td>
                    <td className="qt-unit bl-unit">{i.unit}</td>
                    <td>
                      {i.change ? (
                        <span className={i.change.trim().startsWith("−") || i.change.trim().startsWith("-") ? "down" : "up"}>
                          {i.change}
                        </span>
                      ) : (
                        <span className="sd-flat">—</span>
                      )}
                    </td>
                    <td>{i.period}</td>
                    <td>
                      <a className="sd-src" href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.publisher}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {b.sections.map((s) => (
        <section key={s.title}>
          <h2 className="section-title">{s.title}</h2>
          <div className="card bl-prose">
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      ))}

      {b.watch.length > 0 && (
        <section>
          <h2 className="section-title">Qué vigilar</h2>
          <div className="card bl-table-wrap">
            <table className="sd-table sd-table-tight">
              <thead>
                <tr>
                  <th>Hito</th>
                  <th>Cuándo</th>
                  <th>Por qué importa</th>
                </tr>
              </thead>
              <tbody>
                {b.watch.map((w) => (
                  <tr key={w.what}>
                    <td>{w.what}</td>
                    <td className="bl-when">{w.when}</td>
                    <td>{w.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {b.dataNotes.length > 0 && (
        <section>
          <h2 className="section-title">Límites de la información</h2>
          <ul className="bl-notes">
            {b.dataNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">Fuentes</h2>
        <ul className="bl-sources">
          {b.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
              <span>
                {s.publisher} · {s.date}
              </span>
            </li>
          ))}
        </ul>
        <p className="bl-foot">
          Información con corte al {fmtDay(b.cutoff)}. Las cifras en vivo están en{" "}
          <Link href="/siderurgia">Siderurgia</Link> y en el <Link href="/">Dashboard</Link>.
        </p>
      </section>
    </main>
  );
}
