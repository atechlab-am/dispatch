import { useState, useEffect, useRef } from "react";
import { globalSearch } from "./api/search.js";

const DEBOUNCE_MS = 300;

const SECTIONS = [
  { key: "tickets",  label: "Tickets",  path: (r) => `/tickets/${r.id}`,  primary: (r) => r.id,          secondary: (r) => r.title },
  { key: "clients",  label: "Clients",  path: () => "/clients",           primary: (r) => r.company || r.name, secondary: (r) => r.email },
  { key: "invoices", label: "Invoices", path: (r) => `/invoices/${r.id}`, primary: (r) => r.id,          secondary: (r) => r.client_name },
  { key: "quotes",   label: "Quotes",   path: (r) => `/quotes/${r.id}`,   primary: (r) => r.id,          secondary: (r) => r.client_name },
];

export default function GlobalSearch({ navigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults(null); return; }
    const id = setTimeout(() => {
      globalSearch(term).then(setResults).catch(() => setResults(null));
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handlePick = (section, row) => {
    navigate(section.path(row));
    setOpen(false);
    setQuery("");
    setResults(null);
  };

  const hasAnyResults = results && SECTIONS.some(s => (results[s.key] || []).length > 0);

  return (
    <div ref={boxRef} style={{ position: "relative", width: 280 }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search tickets, clients, invoices…"
        style={{
          width: "100%", padding: "7px 12px", borderRadius: "var(--dispatch-radius-md)", border: "1px solid #e2e8f0",
          fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
        }}
      />
      {open && query.trim() && (
        <div style={{ position: "absolute", left: 0, top: "calc(100% + 8px)", width: 360, maxHeight: 440, overflowY: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100 }}>
          {results === null ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: "#64748b" }}>Searching…</div>
          ) : !hasAnyResults ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: "#64748b" }}>No results for "{query}".</div>
          ) : (
            SECTIONS.map(section => {
              const rows = results[section.key] || [];
              if (!rows.length) return null;
              return (
                <div key={section.key}>
                  <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {section.label}
                  </div>
                  {rows.map(row => (
                    <div
                      key={row.id}
                      onClick={() => handlePick(section, row)}
                      style={{ padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{section.primary(row)}</div>
                      {section.secondary(row) && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>{section.secondary(row)}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
