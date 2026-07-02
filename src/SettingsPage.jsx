import { useState, useEffect } from "react";
import { listUsers, createUser, updateUser, deactivateUser, changeOwnPassword } from "./api/users.js";
import { listPortalAccounts, createPortalAccount, updatePortalAccount, deletePortalAccount } from "./api/portal.js";
import { listClients } from "./api/clients.js";

const brand = {
  blue: "#1A5CBA",
  accent: "#E8A020",
  bg: "#F4F7FC",
  surface: "#FFFFFF",
  border: "#D8E2F0",
  text: "#0D1B2A",
  muted: "#5B6D82",
  success: "#1a8f4a",
  danger: "#c0392b",
};

const inp = {
  width: "100%",
  padding: "8px 11px",
  border: `1px solid ${brand.border}`,
  borderRadius: 6,
  fontSize: 13,
  color: brand.text,
  background: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
    {children}
  </div>
);

const Btn = ({ onClick, children, variant = "primary", small, disabled, type = "button" }) => {
  const s = {
    primary:   { background: brand.blue,    color: "#fff",          border: "none" },
    secondary: { background: "#fff",         color: brand.blue,      border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",         color: brand.danger,    border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,   color: "#fff",          border: "none" },
    ghost:     { background: "transparent",  color: brand.muted,     border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
};

// ─── Add User form ────────────────────────────────────────────────────────────
function AddUserForm({ onAdded, showToast }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "technician" });
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setSaving(true);
    try {
      const user = await createUser(form);
      onAdded(user);
      setForm({ name: "", email: "", password: "", role: "technician" });
      showToast("User created.", "ok");
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Failed to create user.";
      showToast(msg, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
          Add User
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto auto", gap: 10, alignItems: "flex-end" }}>
          <div>
            <FieldLabel>Name</FieldLabel>
            <input style={inp} value={form.name} onChange={e => up("name", e.target.value)} placeholder="Full name" required />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input style={inp} type="email" value={form.email} onChange={e => up("email", e.target.value)} placeholder="user@atechsolutions.org" required />
          </div>
          <div>
            <FieldLabel>Password</FieldLabel>
            <input style={inp} type="password" value={form.password} onChange={e => up("password", e.target.value)} placeholder="Temporary password" required />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <select style={inp} value={form.role} onChange={e => up("role", e.target.value)}>
              <option value="technician">Technician</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ paddingTop: 18 }}>
            <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Adding…" : "+ Add"}</Btn>
          </div>
        </div>
      </div>
    </form>
  );
}

// ─── Edit User row ────────────────────────────────────────────────────────────
function UserRow({ user, currentUserId, onUpdated, onDeactivated, showToast }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user.name, email: user.email, role: user.role, password: "" });
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateUser(user.id, {
        name: form.name,
        email: form.email,
        role: form.role,
        active: user.active,
        password: form.password,
      });
      onUpdated(updated);
      setEditing(false);
      setForm(p => ({ ...p, password: "" }));
      showToast("User updated.", "ok");
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Failed to update user.";
      showToast(msg, "err");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`)) return;
    try {
      await deactivateUser(user.id);
      onDeactivated(user.id);
      showToast("User deactivated.", "ok");
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Failed to deactivate user.";
      showToast(msg, "err");
    }
  };

  const isSelf = user.id === currentUserId;

  const roleBadge = (role) => {
    const color = role === "admin" ? brand.blue : brand.muted;
    return (
      <span style={{ background: color, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
        {role}
      </span>
    );
  };

  const statusBadge = (active) => (
    <span style={{ background: active ? "#dcfce7" : "#f3f4f6", color: active ? brand.success : brand.muted, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
      {active ? "Active" : "Inactive"}
    </span>
  );

  const cellStyle = { padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };

  if (editing) {
    return (
      <tr style={{ background: "#f0f6ff" }}>
        <td style={cellStyle}>
          <input style={{ ...inp, width: "100%" }} value={form.name} onChange={e => up("name", e.target.value)} />
        </td>
        <td style={cellStyle}>
          <input style={{ ...inp, width: "100%" }} type="email" value={form.email} onChange={e => up("email", e.target.value)} />
        </td>
        <td style={cellStyle}>
          <select style={inp} value={form.role} onChange={e => up("role", e.target.value)}>
            <option value="technician">Technician</option>
            <option value="admin">Admin</option>
          </select>
        </td>
        <td style={cellStyle}>
          <input style={{ ...inp, width: "100%" }} type="password" value={form.password} onChange={e => up("password", e.target.value)} placeholder="Leave blank to keep current" />
        </td>
        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>—</td>
        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={handleSave} variant="accent" small disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            <Btn onClick={() => { setEditing(false); setForm({ name: user.name, email: user.email, role: user.role, password: "" }); }} variant="ghost" small>Cancel</Btn>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ background: user.active ? brand.surface : "#f9fafb" }}>
      <td style={{ ...cellStyle, fontWeight: 600, color: user.active ? brand.text : brand.muted }}>{user.name}{isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: brand.muted }}>(you)</span>}</td>
      <td style={{ ...cellStyle, color: brand.muted, fontSize: 13 }}>{user.email}</td>
      <td style={cellStyle}>{roleBadge(user.role)}</td>
      <td style={cellStyle}>—</td>
      <td style={cellStyle}>{statusBadge(user.active)}</td>
      <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => setEditing(true)} variant="secondary" small>Edit</Btn>
          {!isSelf && user.active && (
            <Btn onClick={handleDeactivate} variant="danger" small>Deactivate</Btn>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId, showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => showToast("Failed to load users.", "err"))
      .finally(() => setLoading(false));
  }, []);

  const handleAdded = (user) => setUsers(p => [...p, user]);
  const handleUpdated = (updated) => setUsers(p => p.map(u => u.id === updated.id ? updated : u));
  const handleDeactivated = (id) => setUsers(p => p.map(u => u.id === id ? { ...u, active: false } : u));

  if (loading) return <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 13, color: brand.muted, marginBottom: 18 }}>
        Manage who can access Dispatch. Admins can manage users and settings. Technicians can create and edit tickets.
      </div>

      <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: brand.bg }}>
              {["Name", "Email", "Role", "New Password", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <UserRow
                key={u.id}
                user={u}
                currentUserId={currentUserId}
                onUpdated={handleUpdated}
                onDeactivated={handleDeactivated}
                showToast={showToast}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AddUserForm onAdded={handleAdded} showToast={showToast} />
    </div>
  );
}

// ─── Password tab ─────────────────────────────────────────────────────────────
function PasswordTab({ showToast }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) {
      showToast("New passwords do not match.", "err");
      return;
    }
    if (form.next.length < 8) {
      showToast("New password must be at least 8 characters.", "err");
      return;
    }
    setSaving(true);
    try {
      await changeOwnPassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      showToast("Password changed successfully.", "ok");
    } catch (err) {
      const msg = err.response?.data?.detail ?? "Failed to change password.";
      showToast(msg, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
      <div style={{ fontSize: 13, color: brand.muted, marginBottom: 20 }}>
        Change your account password. You will remain signed in after changing it.
      </div>
      {[
        ["current", "Current Password", "Your current password"],
        ["next",    "New Password",     "At least 8 characters"],
        ["confirm", "Confirm New Password", "Repeat new password"],
      ].map(([key, label, ph]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <FieldLabel>{label}</FieldLabel>
          <input
            type="password"
            value={form[key]}
            onChange={e => up(key, e.target.value)}
            placeholder={ph}
            required
            style={inp}
          />
        </div>
      ))}
      <Btn type="submit" variant="accent" disabled={saving}>
        {saving ? "Changing…" : "Change Password"}
      </Btn>
    </form>
  );
}

// ─── Portal Accounts tab ──────────────────────────────────────────────────────
function PortalAccountsTab({ showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ client_id: "", name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name, email, password, active }

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    Promise.all([listPortalAccounts(), listClients()])
      .then(([accts, cls]) => { setAccounts(accts); setClients(cls); })
      .catch(() => showToast("Failed to load portal accounts.", "err"))
      .finally(() => setLoading(false));
  }, []);

  const clientName = (id) => clients.find(c => c.id === id)?.name || `Client #${id}`;

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.client_id || !form.name || !form.email || !form.password) return;
    setSaving(true);
    try {
      const acct = await createPortalAccount({ ...form, client_id: parseInt(form.client_id) });
      setAccounts(p => [...p, acct]);
      setForm({ client_id: "", name: "", email: "", password: "" });
      showToast("Portal account created.", "ok");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to create account.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id) {
    setSaving(true);
    try {
      const patch = {};
      if (editing.name) patch.name = editing.name;
      if (editing.email) patch.email = editing.email;
      if (editing.password) patch.password = editing.password;
      if (editing.active !== undefined) patch.active = editing.active;
      const updated = await updatePortalAccount(id, patch);
      setAccounts(p => p.map(a => a.id === id ? updated : a));
      setEditing(null);
      showToast("Portal account updated.", "ok");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update account.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete portal account for ${name}? They will no longer be able to sign in.`)) return;
    try {
      await deletePortalAccount(id);
      setAccounts(p => p.filter(a => a.id !== id));
      showToast("Portal account deleted.", "ok");
    } catch {
      showToast("Failed to delete account.", "err");
    }
  }

  if (loading) return <div style={{ color: brand.muted, padding: "40px 0", textAlign: "center" }}>Loading…</div>;

  const cellStyle = { padding: "12px 14px", borderBottom: `1px solid ${brand.border}`, verticalAlign: "middle" };

  return (
    <div>
      <div style={{ fontSize: 13, color: brand.muted, marginBottom: 18 }}>
        Create login accounts for clients to access their portal at <strong>/p/[client-slug]</strong>. Set a slug on the client record first, then create a portal account. Each account is scoped to that client's tickets and invoices only.
      </div>

      <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: brand.bg }}>
              {["Client", "Portal URL", "Name", "Email", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${brand.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cellStyle, color: brand.muted, textAlign: "center", fontSize: 13 }}>
                  No portal accounts yet.
                </td>
              </tr>
            )}
            {accounts.map(a => {
              const c = clients.find(cl => cl.id === a.client_id);
              const slug = c?.slug;
              return editing?.id === a.id ? (
              <tr key={a.id} style={{ background: "#f0f6ff" }}>
                <td style={cellStyle}>{clientName(a.client_id)}</td>
                <td style={{ ...cellStyle, fontSize: 12, color: brand.muted }}>{slug ? `/p/${slug}` : "—"}</td>
                <td style={cellStyle}>
                  <input style={{ ...inp, width: "100%" }} value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
                </td>
                <td style={cellStyle}>
                  <input style={{ ...inp, width: "100%" }} type="email" value={editing.email} onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
                </td>
                <td style={cellStyle}>
                  <input style={{ ...inp, width: "100%" }} type="password" value={editing.password} onChange={e => setEditing(p => ({ ...p, password: e.target.value }))} placeholder="New password (leave blank to keep)" />
                </td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => handleSaveEdit(a.id)} variant="accent" small disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                    <Btn onClick={() => setEditing(null)} variant="ghost" small>Cancel</Btn>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={a.id} style={{ background: a.active ? brand.surface : "#f9fafb" }}>
                <td style={{ ...cellStyle, fontWeight: 600, color: brand.text }}>{clientName(a.client_id)}</td>
                <td style={{ ...cellStyle, fontSize: 12, color: slug ? brand.blue : brand.muted }}>
                  {slug ? <code style={{ background: "#f0f6ff", padding: "2px 6px", borderRadius: 4 }}>/p/{slug}</code> : <span style={{ color: "#e67e22" }}>no slug set</span>}
                </td>
                <td style={{ ...cellStyle, color: brand.text }}>{a.name}</td>
                <td style={{ ...cellStyle, color: brand.muted, fontSize: 13 }}>{a.email}</td>
                <td style={cellStyle}>
                  <span style={{ background: a.active ? "#dcfce7" : "#f3f4f6", color: a.active ? brand.success : brand.muted, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                    {a.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => setEditing({ id: a.id, name: a.name, email: a.email, password: "" })} variant="secondary" small>Edit</Btn>
                    {a.active ? (
                      <Btn onClick={() => updatePortalAccount(a.id, { active: false }).then(u => setAccounts(p => p.map(x => x.id === a.id ? u : x))).catch(() => showToast("Failed.", "err"))} variant="ghost" small>Disable</Btn>
                    ) : (
                      <Btn onClick={() => updatePortalAccount(a.id, { active: true }).then(u => setAccounts(p => p.map(x => x.id === a.id ? u : x))).catch(() => showToast("Failed.", "err"))} variant="secondary" small>Enable</Btn>
                    )}
                    <Btn onClick={() => handleDelete(a.id, a.name)} variant="danger" small>Delete</Btn>
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd}>
        <div style={{ background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 10, padding: "16px 18px", marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: brand.blue, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
            Add Portal Account
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <FieldLabel>Client</FieldLabel>
              <select style={inp} value={form.client_id} onChange={e => up("client_id", e.target.value)} required>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Name</FieldLabel>
              <input style={inp} value={form.name} onChange={e => up("name", e.target.value)} placeholder="Contact name" required />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input style={inp} type="email" value={form.email} onChange={e => up("email", e.target.value)} placeholder="client@example.com" required />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <input style={inp} type="password" value={form.password} onChange={e => up("password", e.target.value)} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <div style={{ paddingTop: 18 }}>
              <Btn type="submit" variant="accent" disabled={saving}>{saving ? "Adding…" : "+ Add"}</Btn>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Settings page shell ──────────────────────────────────────────────────────
export default function SettingsPage({ user, showToast }) {
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState(isAdmin ? "users" : "password");

  const tabs = [
    ...(isAdmin ? [{ id: "users", label: "Users" }] : []),
    { id: "password", label: "Change Password" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: brand.text, marginBottom: 4 }}>Settings</div>
        <div style={{ fontSize: 13, color: brand.muted }}>Manage users and account preferences.</div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${brand.border}`, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "8px 20px", background: "none", border: "none", borderBottom: `3px solid ${tab === t.id ? brand.blue : "transparent"}`, marginBottom: -2, fontWeight: 700, fontSize: 13, color: tab === t.id ? brand.blue : brand.muted, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && isAdmin && (
        <UsersTab currentUserId={user.id} showToast={showToast} />
      )}
      {tab === "password" && (
        <PasswordTab showToast={showToast} />
      )}
    </div>
  );
}
