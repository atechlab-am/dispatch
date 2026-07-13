import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { listClients, updateClient } from "./api/clients.js";
import { listPortalAccounts, createPortalAccount, updatePortalAccount, deletePortalAccount } from "./api/portal.js";

const brand = {
  blue: "#1A5CBA",
  accent: "#E8A020",
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  text: "var(--dispatch-text)",
  muted: "var(--dispatch-muted)",
  success: "#1a8f4a",
  danger: "#c0392b",
};

const inp = {
  padding: "7px 10px",
  border: `1px solid ${brand.border}`,
  borderRadius: 6,
  fontSize: 13,
  color: brand.text,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const Btn = ({ onClick, children, variant = "primary", small, disabled }) => {
  const s = {
    primary:   { background: brand.blue,    color: "var(--dispatch-on-color)",       border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)",       border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...s,
      padding: small ? "4px 10px" : "7px 16px",
      borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "inherit", opacity: disabled ? 0.6 : 1,
      whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
};

// ─── Slug editor ──────────────────────────────────────────────────────────────
// slugClient = the client record that currently holds (or will hold) the slug.
// For a business group this is the first record with a slug, or any member record.

function SlugEditor({ slugClient, onUpdated, showToast }) {
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(slugClient.slug || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateClient(slugClient.id, {
        name: slugClient.name,
        email: slugClient.email,
        phone: slugClient.phone,
        address: slugClient.address,
        client_type: slugClient.client_type,
        company: slugClient.company,
        notes: slugClient.notes,
        slug: slug || null,
      });
      onUpdated(updated);
      setEditing(false);
      showToast("Portal URL updated.", "ok");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update URL.", "err");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: brand.muted }}>/p/</span>
        <input
          style={{ ...inp, width: 180 }}
          value={slug}
          onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="company-slug"
          autoFocus
        />
        <Btn onClick={handleSave} variant="accent" small disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        <Btn onClick={() => { setEditing(false); setSlug(slugClient.slug || ""); }} variant="ghost" small>Cancel</Btn>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {slugClient.slug ? (
        <code style={{ background: "#e8f0fd", color: brand.blue, padding: "3px 10px", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          /p/{slugClient.slug}
        </code>
      ) : (
        <span style={{ fontSize: 13, color: "#e67e22", fontStyle: "italic" }}>No portal URL set</span>
      )}
      <Btn onClick={() => setEditing(true)} variant="ghost" small>{slugClient.slug ? "Edit" : "Set URL"}</Btn>
    </div>
  );
}

// ─── Add user form ────────────────────────────────────────────────────────────
// contacts = company members (business) or empty array (residential).
// For business: user must pick from the contact dropdown; name/email are pre-filled and locked.
// For residential: free-text name + email.

function AddUserForm({ portalClientId, contacts, onAdded, onCancel, showToast }) {
  const isBusiness = contacts.length > 0;
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);

  function handlePick(e) {
    const id = e.target.value;
    setSelectedId(id);
    if (!id) { setForm({ name: "", email: "", password: "" }); return; }
    const c = contacts.find(x => String(x.id) === id);
    if (c) setForm({ name: c.name, email: c.email || "", password: "" });
  }

  async function handleSubmit() {
    if (isBusiness && !selectedId) {
      showToast("Select a contact from the list.", "err");
      return;
    }
    if (!form.name || !form.email || !form.password) {
      showToast("Name, email and password are required.", "err");
      return;
    }
    setSaving(true);
    try {
      // For business: link the portal user to the selected contact's own client id
      const effectiveClientId = (isBusiness && selectedId) ? parseInt(selectedId) : portalClientId;
      const acct = await createPortalAccount({ ...form, client_id: effectiveClientId });
      onAdded(acct);
      showToast("Portal user added.", "ok");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to add user.", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {isBusiness && (
        <tr style={{ background: "#f0f6ff" }}>
          <td colSpan={5} style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: brand.muted, whiteSpace: "nowrap" }}>Contact:</span>
              <select style={{ ...inp, maxWidth: 380 }} value={selectedId} onChange={handlePick}>
                <option value="">— select a company contact —</option>
                {contacts.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}{c.email ? ` (${c.email})` : ""}</option>
                ))}
              </select>
            </div>
          </td>
        </tr>
      )}
      <tr style={{ background: "#f0f6ff" }}>
        <td style={{ padding: "8px 12px" }}>
          {isBusiness
            ? <span style={{ fontSize: 13, color: selectedId ? brand.text : brand.muted, fontStyle: selectedId ? "normal" : "italic" }}>{form.name || "—"}</span>
            : <input style={{ ...inp, width: "100%" }} value={form.name} autoComplete="off" onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
          }
        </td>
        <td style={{ padding: "8px 12px" }}>
          {isBusiness
            ? <span style={{ fontSize: 13, color: brand.muted, fontStyle: selectedId ? "normal" : "italic" }}>{form.email || "—"}</span>
            : <input style={{ ...inp, width: "100%" }} autoComplete="off" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
          }
        </td>
        <td style={{ padding: "8px 12px" }}>
          <input style={{ ...inp, width: "100%" }} type="password" autoComplete="new-password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 characters" />
        </td>
        <td style={{ padding: "8px 12px" }} />
        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={handleSubmit} variant="accent" small disabled={saving}>{saving ? "Adding…" : "Add"}</Btn>
            <Btn onClick={onCancel} variant="ghost" small>Cancel</Btn>
          </div>
        </td>
      </tr>
    </>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({ account, onUpdated, onDeleted, showToast }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: account.name, email: account.email, password: "" });
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      const patch = { name: form.name, email: form.email };
      if (form.password) patch.password = form.password;
      const updated = await updatePortalAccount(account.id, patch);
      onUpdated(updated);
      setEditing(false);
      setForm(p => ({ ...p, password: "" }));
      showToast("Portal user updated.", "ok");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    try {
      const updated = await updatePortalAccount(account.id, { active: !account.active });
      onUpdated(updated);
      showToast(`User ${updated.active ? "enabled" : "disabled"}.`, "ok");
    } catch { showToast("Failed.", "err"); }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete portal access for ${account.name}?`)) return;
    try {
      await deletePortalAccount(account.id);
      onDeleted(account.id);
      showToast("Portal user deleted.", "ok");
    } catch { showToast("Failed to delete.", "err"); }
  }

  const cell = { padding: "10px 12px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };

  if (editing) {
    return (
      <tr style={{ background: "#f0f6ff" }}>
        <td style={cell}><input style={{ ...inp, width: "100%" }} autoComplete="off" value={form.name} onChange={e => up("name", e.target.value)} /></td>
        <td style={cell}><input style={{ ...inp, width: "100%" }} autoComplete="off" value={form.email} onChange={e => up("email", e.target.value)} /></td>
        <td style={cell}><input style={{ ...inp, width: "100%" }} type="password" autoComplete="new-password" value={form.password} onChange={e => up("password", e.target.value)} placeholder="New password (blank = keep)" /></td>
        <td style={cell} />
        <td style={{ ...cell, whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={handleSave} variant="accent" small disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            <Btn onClick={() => { setEditing(false); setForm({ name: account.name, email: account.email, password: "" }); }} variant="ghost" small>Cancel</Btn>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ background: account.active ? brand.surface : "#f9fafb" }}>
      <td style={{ ...cell, fontWeight: 500, color: account.active ? brand.text : brand.muted }}>{account.name}</td>
      <td style={{ ...cell, fontSize: 13, color: brand.muted }}>{account.email}</td>
      <td style={{ ...cell, fontSize: 12, color: brand.muted }}>—</td>
      <td style={cell}>
        <span style={{
          background: account.active ? "#dcfce7" : "#f3f4f6",
          color: account.active ? brand.success : brand.muted,
          borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        }}>
          {account.active ? "Active" : "Disabled"}
        </span>
      </td>
      <td style={{ ...cell, whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => setEditing(true)} variant="secondary" small>Edit</Btn>
          <Btn onClick={handleToggle} variant="ghost" small>{account.active ? "Disable" : "Enable"}</Btn>
          <Btn onClick={handleDelete} variant="danger" small>Delete</Btn>
        </div>
      </td>
    </tr>
  );
}

// ─── Portal card (one per business group or residential individual) ────────────

function PortalCard({ label, subtitle, badge, slugClient, contacts, portalClientId, portalAccounts, allAccounts, onClientUpdated, onAccountsChanged, showToast, defaultExpanded }) {
  const [localAccounts, setLocalAccounts] = useState(portalAccounts);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState(!!defaultExpanded);

  useEffect(() => {
    setLocalAccounts(portalAccounts);
  }, [portalAccounts]);

  function handleAdded(acct) {
    const next = [...localAccounts, acct];
    setLocalAccounts(next);
    onAccountsChanged(next);
    setShowAdd(false);
  }

  function handleUpdated(updated) {
    const next = localAccounts.map(x => x.id === updated.id ? updated : x);
    setLocalAccounts(next);
    onAccountsChanged(next);
  }

  function handleDeleted(id) {
    const next = localAccounts.filter(x => x.id !== id);
    setLocalAccounts(next);
    onAccountsChanged(next);
  }

  const hasPortal = !!slugClient?.slug;

  return (
    <div style={{ background: brand.surface, borderRadius: 12, border: `1px solid ${brand.border}`, overflow: "hidden", marginBottom: 12 }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 20px", cursor: "pointer",
          background: expanded ? "#fafcff" : brand.surface,
          borderBottom: expanded ? `1px solid ${brand.border}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: brand.text }}>{label}</span>
          {subtitle && <span style={{ fontSize: 12, color: brand.muted }}>{subtitle}</span>}
          {badge && (
            <span style={{ background: "#f1f5f9", color: brand.muted, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
              {badge}
            </span>
          )}
          {hasPortal ? (
            <code style={{ background: "#e8f0fd", color: brand.blue, padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
              /p/{slugClient.slug}
            </code>
          ) : (
            <span style={{ fontSize: 12, color: "#e67e22", fontStyle: "italic" }}>No portal URL</span>
          )}
          <span style={{
            background: localAccounts.length > 0 ? "#e8f0fd" : "#f1f5f9",
            color: localAccounts.length > 0 ? brand.blue : brand.muted,
            borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700,
          }}>
            {localAccounts.length} {localAccounts.length === 1 ? "portal user" : "portal users"}
          </span>
        </div>
        <span style={{ color: brand.muted, fontSize: 14 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "16px 20px" }}>

          {/* Portal URL row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
              Portal URL
            </span>
            {slugClient
              ? <SlugEditor slugClient={slugClient} onUpdated={onClientUpdated} showToast={showToast} />
              : <span style={{ fontSize: 13, color: brand.muted, fontStyle: "italic" }}>No client record available.</span>
            }
          </div>

          {/* Contacts list (business only, when >1) */}
          {contacts.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                Company Contacts
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {contacts.map(c => (
                  <div key={c.id} style={{
                    background: brand.bg, border: `1px solid ${brand.border}`,
                    borderRadius: 8, padding: "6px 14px", fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 600, color: brand.text }}>{c.name}</span>
                    {c.email && <span style={{ color: brand.muted, marginLeft: 8 }}>{c.email}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portal users table */}
          <div style={{ border: `1px solid ${brand.border}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: brand.bg }}>
                  {["Name", "Email", "Password", "Status", "Actions"].map(h => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: "left", fontSize: 11,
                      fontWeight: 700, color: brand.muted, textTransform: "uppercase",
                      letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localAccounts.length === 0 && !showAdd && (
                  <tr>
                    <td colSpan={5} style={{ padding: "20px 12px", color: brand.muted, fontSize: 13, textAlign: "center" }}>
                      No portal users yet.
                    </td>
                  </tr>
                )}
                {localAccounts.map(a => (
                  <UserRow
                    key={a.id}
                    account={a}
                    onUpdated={handleUpdated}
                    onDeleted={handleDeleted}
                    showToast={showToast}
                  />
                ))}
                {showAdd && portalClientId && (
                  <AddUserForm
                    portalClientId={portalClientId}
                    contacts={contacts}
                    onAdded={handleAdded}
                    onCancel={() => setShowAdd(false)}
                    showToast={showToast}
                  />
                )}
              </tbody>
            </table>
          </div>

          {!showAdd && (
            <div style={{ marginTop: 12 }}>
              <Btn onClick={e => { e.stopPropagation(); setShowAdd(true); }} variant="secondary" small>+ Add Portal User</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 12px" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</span>
      <span style={{ fontSize: 12, color: brand.muted, background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 20, padding: "1px 9px" }}>{count}</span>
      <div style={{ flex: 1, height: 1, background: brand.border }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortalPage({ showToast }) {
  const [searchParams] = useSearchParams();
  const searchParam = searchParams.get("search") || "";
  const [clients, setClients] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParam);
  // Deep-linked from a client's "Portal Access" link: show its card even if
  // it has no portal activity yet, since that's exactly the case that link
  // exists for (provisioning access for the first time).
  const [showAll, setShowAll] = useState(!!searchParam);

  useEffect(() => {
    Promise.all([listClients(), listPortalAccounts()])
      .then(([cls, accts]) => { setClients(cls); setAccounts(accts); })
      .catch(() => showToast("Failed to load portal data.", "err"))
      .finally(() => setLoading(false));
  }, []);

  function handleClientUpdated(updated) {
    setClients(p => p.map(x => x.id === updated.id ? updated : x));
  }

  // Group business clients by company name
  const businessGroups = {};
  clients.filter(c => c.client_type === "business").forEach(c => {
    const key = c.company || `__solo_${c.id}`;
    if (!businessGroups[key]) businessGroups[key] = [];
    businessGroups[key].push(c);
  });

  const residentialClients = clients.filter(c => c.client_type === "residential");

  const q = search.toLowerCase();

  function matchesSearch(label, contacts) {
    if (!q) return true;
    return label.toLowerCase().includes(q) || contacts.some(c => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }

  function hasPortalActivity(contacts) {
    return contacts.some(c => c.slug || accounts.some(a => a.client_id === c.id));
  }

  // Build business card entries
  const businessCards = Object.entries(businessGroups).map(([key, members]) => {
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
    const label = sorted[0].company || sorted[0].name;
    // Slug always lives on the first (alphabetically) member — the "primary" record.
    // If another member somehow holds the slug, we still use sorted[0] as the edit target
    // so future saves are consistent. The displayed slug reads from whichever member has it.
    const slugHolder = sorted.find(c => c.slug) || sorted[0];
    const portalClientId = slugHolder.id;
    const portalAccounts = accounts.filter(a => members.some(c => c.id === a.client_id));
    return { key, label, members: sorted, slugClient: slugHolder, portalClientId, portalAccounts };
  }).filter(g => {
    if (!showAll && !hasPortalActivity(g.members)) return false;
    return matchesSearch(g.label, g.members);
  }).sort((a, b) => a.label.localeCompare(b.label));

  // Build residential card entries
  const residentialCards = residentialClients.map(c => {
    const portalAccounts = accounts.filter(a => a.client_id === c.id);
    return { client: c, portalAccounts };
  }).filter(({ client, portalAccounts }) => {
    if (!showAll && !client.slug && portalAccounts.length === 0) return false;
    return matchesSearch(client.name, [client]);
  }).sort((a, b) => a.client.name.localeCompare(b.client.name));

  if (loading) return (
    <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      Loading…
    </div>
  );

  const totalShown = businessCards.length + residentialCards.length;

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Client Portal</div>
        <div style={{ fontSize: 13, color: brand.muted }}>
          Manage portal access. Business clients are grouped by company — all contacts share one portal URL and can each have their own login.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <input
          style={{ ...inp, width: 280 }}
          placeholder="Search clients…"
          value={search}
          autoComplete="off"
          onChange={e => setSearch(e.target.value)}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: brand.muted, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ cursor: "pointer" }} />
          Show all (including without portal)
        </label>
        <span style={{ marginLeft: "auto", fontSize: 13, color: brand.muted }}>
          {totalShown} {totalShown === 1 ? "entry" : "entries"}
        </span>
      </div>

      {totalShown === 0 && (
        <div style={{ background: brand.surface, borderRadius: 12, padding: 48, textAlign: "center", color: brand.muted, fontSize: 14, border: `1px solid ${brand.border}` }}>
          {search ? "No clients match your search." : 'No portals configured yet. Enable "Show all" to set one up.'}
        </div>
      )}

      {businessCards.length > 0 && (
        <>
          <SectionHeader label="Business" count={businessCards.length} />
          {businessCards.map(g => (
            <PortalCard
              key={g.key}
              label={g.label}
              badge={g.members.length > 1 ? `${g.members.length} contacts` : null}
              slugClient={g.slugClient}
              contacts={g.members}
              portalClientId={g.portalClientId}
              portalAccounts={g.portalAccounts}
              allAccounts={accounts}
              onClientUpdated={handleClientUpdated}
              onAccountsChanged={updated => {
                const memberIds = new Set(g.members.map(c => c.id));
                setAccounts(prev => [...prev.filter(a => !memberIds.has(a.client_id)), ...updated]);
              }}
              showToast={showToast}
              defaultExpanded={!!searchParam && g.label === searchParam}
            />
          ))}
        </>
      )}

      {residentialCards.length > 0 && (
        <>
          <SectionHeader label="Residential" count={residentialCards.length} />
          {residentialCards.map(({ client, portalAccounts }) => (
            <PortalCard
              key={client.id}
              label={client.name}
              subtitle={client.email || null}
              slugClient={client.slug ? client : null}
              contacts={[client]}
              portalClientId={client.slug ? client.id : null}
              portalAccounts={portalAccounts}
              allAccounts={accounts}
              onClientUpdated={handleClientUpdated}
              onAccountsChanged={updated => {
                setAccounts(prev => [...prev.filter(a => a.client_id !== client.id), ...updated]);
              }}
              showToast={showToast}
              defaultExpanded={!!searchParam && client.name === searchParam}
            />
          ))}
        </>
      )}
    </div>
  );
}
