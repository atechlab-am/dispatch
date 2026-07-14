import { useState, useEffect, useCallback, useRef } from "react";
import {
  createLead, updateLead, deleteLead, moveLeadStage, convertLeadToClient,
  checkLeadDuplicates, listLeadActivities, addLeadActivity,
} from "./api/leads.js";

const brand = {
  blue: "var(--dispatch-primary)", accent: "#E8A020", bg: "var(--dispatch-bg)", surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)", text: "var(--dispatch-text)", muted: "var(--dispatch-muted)",
  success: "#1a8f4a", danger: "#c0392b",
};

const inp = {
  width: "100%", padding: "8px 11px", border: `1px solid ${brand.border}`,
  borderRadius: 6, fontSize: 13, color: brand.text, background: "#fff",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
    {children}
  </div>
);

const Btn = ({ onClick, children, variant = "primary", small, disabled, type = "button" }) => {
  const s = {
    primary:   { background: brand.blue,    color: "var(--dispatch-on-color)", border: "none" },
    secondary: { background: "#fff",        color: brand.blue,   border: `1.5px solid ${brand.blue}` },
    danger:    { background: "#fff",        color: brand.danger, border: `1.5px solid ${brand.danger}` },
    accent:    { background: brand.accent,  color: "var(--dispatch-on-color)", border: "none" },
    ghost:     { background: "transparent", color: brand.muted,  border: `1px solid ${brand.border}` },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...s, padding: small ? "5px 12px" : "8px 18px", borderRadius: 6, fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
};

const EMPTY_FORM = {
  business_name: "", title: "", industry: "", address: "", area: "",
  phone: "", website: "", contact_name: "", contact_email: "", contact_phone: "",
  source: "other", priority: "medium", outreach_channel: "", value_estimate: "",
  date_contacted: "", follow_up_date: "", follow_up_scheduled: false, notes: "",
};

const ACTIVITY_LABEL = { call: "Call", email: "Email", note: "Note", meeting: "Meeting", stage_change: "Stage Change" };

function timeAgo(iso) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function LeadModal({ lead, existingLeads, showToast, onClose, onSaved, onConverted, onDeleted }) {
  const isNew = lead === null;
  const [form, setForm] = useState(() => lead ? {
    business_name: lead.business_name, title: lead.title, industry: lead.industry, address: lead.address,
    area: lead.area, phone: lead.phone, website: lead.website, contact_name: lead.contact_name,
    contact_email: lead.contact_email, contact_phone: lead.contact_phone, source: lead.source,
    priority: lead.priority, outreach_channel: lead.outreach_channel || "", value_estimate: lead.value_estimate ?? "",
    date_contacted: lead.date_contacted || "", follow_up_date: lead.follow_up_date || "",
    follow_up_scheduled: lead.follow_up_scheduled || false, notes: lead.notes,
  } : EMPTY_FORM);
  const [stage, setStage] = useState(lead?.stage || "new");
  const [lostReason, setLostReason] = useState(lead?.lost_reason || "");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [activities, setActivities] = useState([]);
  const [noteType, setNoteType] = useState("call");
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const debounceRef = useRef(null);

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadActivities = useCallback(async (leadId) => {
    try { setActivities(await listLeadActivities(leadId)); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isNew) loadActivities(lead.id);
  }, [isNew, lead, loadActivities]);

  useEffect(() => {
    if (!isNew) return; // skip on edit — would trivially match itself
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const hasEnoughSignal = form.business_name.trim().length >= 3 || form.website.trim() || form.phone.trim()
      || form.contact_name.trim().length >= 3 || form.contact_email.trim();
    if (!hasEnoughSignal) { setDuplicates([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await checkLeadDuplicates({
          business_name: form.business_name, website: form.website, phone: form.phone,
          contact_name: form.contact_name, contact_email: form.contact_email,
        });
        setDuplicates(matches);
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [isNew, form.business_name, form.website, form.phone, form.contact_name, form.contact_email]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.business_name.trim()) return;
    if (stage === "lost" && !lostReason.trim()) {
      showToast?.("A reason is required when moving to Lost.", "err");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        outreach_channel: form.outreach_channel || null,
        value_estimate: form.value_estimate === "" ? null : Number(form.value_estimate),
        date_contacted: form.date_contacted || null,
        follow_up_date: form.follow_up_date || null,
      };
      let saved;
      if (isNew) {
        saved = await createLead(payload);
        if (stage !== "new") saved = await moveLeadStage(saved.id, stage, lostReason);
      } else {
        saved = await updateLead(lead.id, payload);
        if (stage !== lead.stage) saved = await moveLeadStage(lead.id, stage, lostReason);
      }
      showToast?.(isNew ? "Lead created." : "Lead updated.", "ok");
      onSaved(saved);
    } catch (err) {
      showToast?.(err?.response?.data?.detail || "Failed to save lead.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!lead || !window.confirm(`Delete lead "${lead.business_name}"? This cannot be undone.`)) return;
    try {
      await deleteLead(lead.id);
      showToast?.("Lead deleted.", "ok");
      onDeleted(lead.id);
    } catch { showToast?.("Failed to delete lead.", "err"); }
  }

  async function handleConvert() {
    if (!lead || !window.confirm("Convert this lead to a Client?")) return;
    setConverting(true);
    try {
      const { client_id } = await convertLeadToClient(lead.id);
      showToast?.(`Converted to Client #${client_id}.`, "ok");
      onConverted({ ...lead, converted_client_id: client_id });
      onClose();
    } catch (err) {
      showToast?.(err?.response?.data?.detail || "Failed to convert lead.", "err");
    } finally {
      setConverting(false);
    }
  }

  async function handleAddNote() {
    if (!lead || !noteBody.trim()) return;
    setAddingNote(true);
    try {
      await addLeadActivity(lead.id, noteType, noteBody.trim());
      setNoteBody("");
      loadActivities(lead.id);
    } catch { showToast?.("Failed to log activity.", "err"); }
    finally { setAddingNote(false); }
  }

  function handleEscape(e) {
    if (e.key === "Escape") onClose();
  }

  const canConvert = !isNew && stage === "won" && !lead.converted_client_id;

  return (
    <div
      onKeyDown={handleEscape}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "40px 16px" }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 920, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", marginBottom: 40, display: "flex", overflow: "hidden" }}>
        {/* Left pane — form */}
        <form onSubmit={handleSubmit} style={{ flex: "0 0 60%", padding: 28, borderRight: `1px solid ${brand.border}`, maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: brand.text }}>{isNew ? "New Lead" : lead.business_name}</div>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: brand.muted }}>×</button>
          </div>

          {duplicates.length > 0 && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#92400e" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Possible duplicate{duplicates.length > 1 ? "s" : ""}:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {duplicates.map(d => (
                  <li key={d.id}>{d.business_name} — {d.stage} (matched on {d.matched_on.join(", ")})</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <FieldLabel>Business Name *</FieldLabel>
            <input style={inp} value={form.business_name} onChange={e => up("business_name", e.target.value)} placeholder="Acme Plumbing" required autoFocus />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div><FieldLabel>Category</FieldLabel><input style={inp} value={form.industry} onChange={e => up("industry", e.target.value)} /></div>
            <div><FieldLabel>Area</FieldLabel><input style={inp} value={form.area} onChange={e => up("area", e.target.value)} /></div>
          </div>

          <div style={{ marginBottom: 14 }}><FieldLabel>Address</FieldLabel><input style={inp} value={form.address} onChange={e => up("address", e.target.value)} /></div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div><FieldLabel>Phone</FieldLabel><input style={inp} value={form.phone} onChange={e => up("phone", e.target.value)} /></div>
            <div><FieldLabel>Website</FieldLabel><input style={inp} value={form.website} onChange={e => up("website", e.target.value)} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div><FieldLabel>Contact Name</FieldLabel><input style={inp} value={form.contact_name} onChange={e => up("contact_name", e.target.value)} /></div>
            <div><FieldLabel>Contact Phone</FieldLabel><input style={inp} value={form.contact_phone} onChange={e => up("contact_phone", e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><FieldLabel>Contact Email</FieldLabel><input style={inp} type="email" value={form.contact_email} onChange={e => up("contact_email", e.target.value)} /></div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <select style={inp} value={form.priority} onChange={e => up("priority", e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <select style={inp} value={stage} onChange={e => setStage(e.target.value)}>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          </div>

          {stage === "lost" && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Reason Lost *</FieldLabel>
              <input style={inp} value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Went with a competitor" />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <FieldLabel>Outreach</FieldLabel>
              <select style={inp} value={form.outreach_channel} onChange={e => up("outreach_channel", e.target.value)}>
                <option value="">—</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="in_person">In Person</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><FieldLabel>Date Contacted</FieldLabel><input style={inp} type="date" value={form.date_contacted} onChange={e => up("date_contacted", e.target.value)} /></div>
            <div>
              <FieldLabel>Follow-Up Date</FieldLabel>
              <input style={inp} type="date" value={form.follow_up_date} onChange={e => up("follow_up_date", e.target.value)} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: brand.text, cursor: "pointer", marginTop: 6 }}>
                <input type="checkbox" checked={form.follow_up_scheduled} onChange={e => up("follow_up_scheduled", e.target.checked)} style={{ cursor: "pointer" }} />
                Follow-up scheduled
              </label>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <FieldLabel>Source</FieldLabel>
              <select style={inp} value={form.source} onChange={e => up("source", e.target.value)}>
                <option value="referral">Referral</option>
                <option value="website">Website</option>
                <option value="outbound">Outbound</option>
                <option value="event">Event</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><FieldLabel>Value Estimate</FieldLabel><input style={inp} type="number" step="0.01" value={form.value_estimate} onChange={e => up("value_estimate", e.target.value)} /></div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Notes</FieldLabel>
            <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.notes} onChange={e => up("notes", e.target.value)} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {!isNew && <Btn type="button" variant="danger" small onClick={handleDelete}>Delete</Btn>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {canConvert && (
                <Btn type="button" variant="accent" small disabled={converting} onClick={handleConvert}>
                  {converting ? "Converting…" : "Convert to Client"}
                </Btn>
              )}
              {!isNew && lead.converted_client_id && (
                <span style={{ fontSize: 12, color: brand.success, alignSelf: "center", fontWeight: 700 }}>
                  Converted to Client #{lead.converted_client_id}
                </span>
              )}
              <Btn type="button" variant="ghost" small onClick={onClose}>Cancel</Btn>
              <Btn type="submit" variant="primary" small disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </form>

        {/* Right pane — activity timeline */}
        <div style={{ flex: "0 0 40%", padding: 28, background: brand.bg, maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: brand.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>Activity</div>

          {isNew ? (
            <div style={{ color: brand.muted, fontSize: 13 }}>Save the lead to start logging activity.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <select style={{ ...inp, width: "auto" }} value={noteType} onChange={e => setNoteType(e.target.value)}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <textarea style={{ ...inp, minHeight: 56, resize: "vertical", marginBottom: 8 }} value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="What happened?" />
              <div style={{ marginBottom: 18 }}>
                <Btn small disabled={addingNote || !noteBody.trim()} onClick={handleAddNote}>{addingNote ? "Adding…" : "Add"}</Btn>
              </div>

              {activities.length === 0 ? (
                <div style={{ color: brand.muted, fontSize: 13 }}>No activity yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activities.map(a => (
                    <div key={a.id} style={{ background: "#fff", border: `1px solid ${brand.border}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: brand.blue, textTransform: "uppercase" }}>{ACTIVITY_LABEL[a.type]}</span>
                        <span style={{ fontSize: 11, color: brand.muted }}>{timeAgo(a.occurred_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: brand.text, whiteSpace: "pre-wrap" }}>{a.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
