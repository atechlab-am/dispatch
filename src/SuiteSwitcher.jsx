import { useState, useEffect, useRef } from "react";

// Icon paths matching the style already used in AppNew.jsx's ICONS set.
const GRID_ICON = "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z";
const EXTERNAL_ICON = "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6 M15 3h6v6 M10 14L21 3";

export default function SuiteSwitcher({ apps = [] }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!apps.length) return null;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch app"
        aria-label="Switch app"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", color: "var(--dispatch-muted)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={GRID_ICON} />
        </svg>
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200, background: "var(--dispatch-surface)", border: "1px solid var(--dispatch-border)", borderRadius: "var(--dispatch-radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--dispatch-border)", fontSize: 11, fontWeight: 700, color: "var(--dispatch-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Suite
          </div>
          {apps.map(app => (
            <a
              key={app.name}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "var(--dispatch-text)", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--dispatch-bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {app.name}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <path d={EXTERNAL_ICON} />
              </svg>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
