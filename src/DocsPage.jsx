import { useState, useEffect } from "react";
import { listDocs, getDoc } from "./api/docs.js";

const brand = {
  blue: "var(--dispatch-primary)",
  accent: "#F59E0B",
  bg: "var(--dispatch-bg)",
  surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)",
  text: "var(--dispatch-text)",
  muted: "var(--dispatch-muted)",
};

// Minimal Markdown -> JSX renderer. Docs content is our own, checked into the
// repo — headings, lists, bold, inline code, fenced code blocks, and links
// cover everything docs/*.md actually uses, so a full Markdown library isn't
// needed for this.
function renderInline(text, keyPrefix) {
  const parts = [];
  let rest = text;
  let i = 0;
  const pattern = /(\*\*(.+?)\*\*|`([^`]+?)`|\[([^\]]+)\]\(([^)]+)\))/;
  while (rest.length) {
    const m = rest.match(pattern);
    if (!m) { parts.push(rest); break; }
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    if (m[2] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      parts.push(<code key={`${keyPrefix}-${i++}`} style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" }}>{m[3]}</code>);
    } else if (m[4] !== undefined) {
      const isRelative = !/^https?:\/\//.test(m[5]);
      parts.push(<a key={`${keyPrefix}-${i++}`} href={isRelative ? undefined : m[5]} style={{ color: brand.blue }}>{m[4]}</a>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      i++;
      blocks.push(
        <pre key={key++} style={{ background: "#0f172a", color: "#e2e8f0", padding: "14px 16px", borderRadius: "var(--dispatch-radius-md)", overflowX: "auto", fontSize: 12.5, lineHeight: 1.6, marginBottom: 16 }}>
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      const sizes = { 1: 24, 2: 19, 3: 15, 4: 13 };
      const Tag = `h${level}`;
      blocks.push(
        <Tag key={key++} style={{ fontSize: sizes[level], fontWeight: 800, color: brand.text, margin: level === 1 ? "0 0 12px" : "26px 0 10px" }}>
          {renderInline(h[2], key)}
        </Tag>
      );
      i++;
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.slice(1, -1).split("|").map(c => c.trim());
      const header = cells(rows[0]);
      const body = rows.slice(2); // skip header + separator row
      blocks.push(
        <div key={key++} style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>{header.map((h2, ci) => <th key={ci} style={{ textAlign: "left", padding: "6px 12px", borderBottom: `2px solid ${brand.border}`, color: brand.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px" }}>{h2}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{cells(r).map((c, ci) => <td key={ci} style={{ padding: "6px 12px", borderBottom: `1px solid ${brand.border}`, color: brand.text }}>{renderInline(c, `${key}-${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} style={{ margin: "0 0 16px", paddingLeft: 22, color: brand.text, fontSize: 14, lineHeight: 1.7 }}>
          {items.map((it, ii) => <li key={ii}>{renderInline(it, `${key}-${ii}`)}</li>)}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !/^\s*-\s+/.test(lines[i]) && !/^\|.*\|$/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} style={{ margin: "0 0 14px", color: brand.text, fontSize: 14, lineHeight: 1.7 }}>
        {renderInline(para.join(" "), key)}
      </p>
    );
  }

  return blocks;
}

export default function DocsPage() {
  const [pages, setPages] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDocs().then((p) => {
      setPages(p);
      if (p.length) setActiveSlug(p[0].slug);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeSlug) return;
    setContent(null);
    getDoc(activeSlug).then(setContent);
  }, [activeSlug]);

  if (loading) return <div style={{ color: brand.muted, fontSize: 14 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
      <div style={{ width: 200, flexShrink: 0, position: "sticky", top: 84 }}>
        {pages.map((p) => (
          <button
            key={p.slug}
            onClick={() => setActiveSlug(p.slug)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "9px 12px", marginBottom: 2,
              background: activeSlug === p.slug ? `${brand.blue}14` : "transparent",
              color: activeSlug === p.slug ? brand.blue : brand.muted,
              fontWeight: activeSlug === p.slug ? 700 : 500,
              border: "none", borderRadius: "var(--dispatch-radius-sm)",
              fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, background: brand.surface, border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-lg)", padding: "32px 40px", maxWidth: 780 }}>
        {content ? renderMarkdown(content.content) : <div style={{ color: brand.muted, fontSize: 14 }}>Loading…</div>}
      </div>
    </div>
  );
}
