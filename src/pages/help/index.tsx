import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/treasury/PageHeader";
import { chapters } from "./chapters";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Standalone help: local search only, independent of operational data. */
export default function Help() {
  const [query, setQuery] = useState("");
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const visible = chapters.filter(chapter => {
    const text = normalize([chapter.title, chapter.module, ...chapter.paragraphs, ...chapter.steps].join(" "));
    return terms.every(term => text.includes(term));
  });
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader title="Guía de usuario" />
      <div className="t-card flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium" htmlFor="help-search">
          Buscar en la guía
          <input id="help-search" type="search" className="t-input w-full" placeholder="Ej.: saldo inicial, rescate, vencimiento…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <button type="button" className="t-button-secondary" onClick={() => setQuery("")} disabled={!query}>Limpiar búsqueda</button>
        <p role="status" className="w-full text-xs text-muted-foreground">{visible.length} de {chapters.length} capítulos</p>
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Índice de la guía" className="t-card p-4 lg:sticky lg:top-5 lg:max-h-[75dvh] lg:overflow-y-auto">
          <h2 className="mb-3 text-sm font-semibold">En esta guía</h2>
          <ul className="grid gap-1">
            {visible.map(chapter => <li key={chapter.id}><a className="block rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-brand-soft hover:text-brand-dark" href={`#${chapter.id}`}>{chapter.title}</a></li>)}
          </ul>
        </nav>
        <div className="grid min-w-0 gap-5">
          {!visible.length && <p className="t-card p-5 text-sm">No encontramos capítulos. Prueba con otra palabra o limpia la búsqueda.</p>}
          {visible.map(chapter => <article key={chapter.id} id={chapter.id} className="t-card scroll-mt-5 p-5 sm:p-7" aria-labelledby={`title-${chapter.id}`}>
            <h2 id={`title-${chapter.id}`} className="mb-4 text-xl font-semibold tracking-tight">{chapter.title}</h2>
            <div className="max-w-prose space-y-3 text-sm leading-7 text-foreground/85">
              {chapter.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              {chapter.steps.length > 0 && <ol className="list-decimal space-y-2 pl-5">{chapter.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>}
            </div>
            {chapter.route !== "/help" && <Link className="mt-5 inline-flex min-h-10 items-center rounded-lg text-sm font-medium text-brand underline underline-offset-4" to={chapter.route}>Abrir {chapter.module}</Link>}
          </article>)}
        </div>
      </div>
    </div>
  );
}
