"use client";

import { useI18n } from "@/i18n/client";
import { loc, type Book } from "@/lib/content";
import { useNowContent } from "@/components/os/SiteData";
import { hashString } from "../lib";

/** a book spine colour from the title: stable, from the palette */
const SPINES = ["#aea3c8", "#e0bd6e", "#89b4a8", "#b0cc86", "#e2786b"];

function Spine({ book }: { book: Book }) {
  const h = hashString(book.title);
  const c = SPINES[h % SPINES.length];
  const bands = 1 + (h % 3);
  return (
    <svg className="app-now-spine" viewBox="0 0 6 16" width={15} height={40} shapeRendering="crispEdges" aria-hidden>
      <rect x={0} y={0} width={6} height={16} fill={c} />
      <rect x={0} y={0} width={1} height={16} fill="#0a0c0b" opacity={0.25} />
      <rect x={5} y={0} width={1} height={16} fill="#ffffff" opacity={0.18} />
      {Array.from({ length: bands }, (_, i) => (
        <rect key={i} x={1} y={2 + i * 2} width={4} height={1} fill="#0a0c0b" opacity={0.45} />
      ))}
      <rect x={2} y={12} width={2} height={2} fill="#0a0c0b" opacity={0.35} />
    </svg>
  );
}

/** Books on the nightstand, then what I'm learning. Both hand-written. */
export function Reading() {
  const { t, lang } = useI18n();
  const r = t.now.reading;
  const { reading: books, learning } = useNowContent();
  return (
    <div className="app-now-read">
      <div>
        <h3 className="app-now-label">{r.books}</h3>
        {books.length ? (
          <ul className="app-now-books">
            {books.map((b) => {
              const body = (
                <>
                  <Spine book={b} />
                  <span className="app-now-book-text">
                    <span className="app-now-book-title">{b.title}</span>
                    <span className="app-now-book-by">
                      {b.author}
                      <span className="app-now-book-status" data-status={b.status}>
                        {r.status[b.status]}
                      </span>
                    </span>
                    {b.note && <span className="app-now-book-note">{loc(b.note, lang)}</span>}
                  </span>
                </>
              );
              return (
                <li key={b.title}>
                  {b.url ? (
                    <a href={b.url} target="_blank" rel="noopener noreferrer" className="app-now-book">
                      {body}
                    </a>
                  ) : (
                    <span className="app-now-book">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="app-now-muted">{r.none}</p>
        )}
      </div>
      {learning.length > 0 && (
        <div>
          <h3 className="app-now-label">{r.learning}</h3>
          <ul className="app-now-learn">
            {learning.map((l) => (
              <li key={l.label.en}>
                <span className="app-now-learn-label">{loc(l.label, lang)}</span>
                {l.note && <span className="app-now-learn-note">{loc(l.note, lang)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
