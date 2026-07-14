import { useState, useEffect, useCallback, useRef } from "react";
import { listAppointments, createAppointment, updateAppointment, deleteAppointment } from "./api/appointments.js";
import { listTickets } from "./api/tickets.js";
import { listLeads } from "./api/leads.js";

const brand = {
  blue: "var(--dispatch-primary)", accent: "#E8A020", bg: "var(--dispatch-bg)", surface: "var(--dispatch-surface)",
  border: "var(--dispatch-border)", text: "var(--dispatch-text)", muted: "var(--dispatch-muted)", danger: "#c0392b",
  lead: "#8E44AD", // distinct color for lead follow-up appointments, separate from ticket (blue) appointments
};

// Full 24-hour range so an appointment at any hour (however it was created) is
// always reachable/visible — the grid used to only render 7am-6pm, which made
// any out-of-range appointment (e.g. from an over-drag past the last visible
// row) silently disappear from the UI with no way to find or cancel it. The
// grid scrolls to business hours by default (see scrollToBusinessHours below)
// so the common case looks the same; scrolling reveals the rest.
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const BUSINESS_START_HOUR = 7;
const ROW_HEIGHT = 40; // keep in sync with the slot's minHeight below

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function SchedulePage({ users = [], showToast }) {
  const [view, setView] = useState("day"); // "day" | "week"
  const [anchor, setAnchor] = useState(() => new Date());
  const [appointments, setAppointments] = useState([]);
  const [unscheduled, setUnscheduled] = useState([]);
  const [leadsToFollowUp, setLeadsToFollowUp] = useState([]);
  const [dragging, setDragging] = useState(null); // ticket/lead being dragged, or {appointment} being rescheduled
  const [loading, setLoading] = useState(true);
  const gridScrollRef = useRef(null);

  const technicians = users.filter(u => u.role === "technician" || u.role === "admin");

  const rangeStart = view === "day" ? startOfDay(anchor) : startOfWeek(anchor);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + (view === "day" ? 1 : 7));

  const days = view === "day" ? [rangeStart] : Array.from({ length: 7 }, (_, i) => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appts, unsched, leads] = await Promise.all([
        listAppointments(rangeStart.toISOString(), rangeEnd.toISOString()),
        // Resolved/Closed tickets with no appointment aren't actually
        // "unscheduled work" — they're just done. Restrict to Active
        // (Open/In Progress/Awaiting Client) so finished tickets don't
        // linger in this sidebar forever.
        listTickets({ has_appointment: false, status: "Active", page_size: 50 }),
        listLeads({ follow_up_scheduled: true }),
      ]);
      setAppointments(appts);
      setUnscheduled(unsched.items || []);
      setLeadsToFollowUp(leads || []);
    } catch {
      showToast?.("Failed to load schedule.", "err");
    } finally {
      setLoading(false);
    }
  }, [rangeStart.getTime(), rangeEnd.getTime()]);

  useEffect(() => { load(); }, [load]);

  // Default the scroll position to business hours so the common case looks
  // the same as before the grid was extended to a full 24 hours.
  useEffect(() => {
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = BUSINESS_START_HOUR * ROW_HEIGHT;
    }
  }, [view, rangeStart.getTime()]);

  const handleDropOnSlot = async (day, hour, technicianId) => {
    if (!dragging) return;
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    try {
      if (dragging.rescheduling) {
        await updateAppointment(dragging.id, {
          ticket_id: dragging.ticket_id, lead_id: dragging.lead_id, technician_id: technicianId,
          start_at: start.toISOString(), end_at: end.toISOString(), notes: dragging.notes || "",
        });
      } else if (dragging.isLead) {
        await createAppointment({
          lead_id: dragging.id, technician_id: technicianId,
          start_at: start.toISOString(), end_at: end.toISOString(), notes: "",
        });
      } else {
        await createAppointment({
          ticket_id: dragging.id, technician_id: technicianId,
          start_at: start.toISOString(), end_at: end.toISOString(), notes: "",
        });
      }
      showToast?.("Scheduled.", "ok");
      load();
    } catch (err) {
      showToast?.(err?.response?.data?.detail || "Failed to schedule.", "err");
    } finally {
      setDragging(null);
    }
  };

  const handleCancel = async (appointmentId) => {
    if (!window.confirm("Cancel this appointment?")) return;
    try {
      await deleteAppointment(appointmentId);
      showToast?.("Appointment cancelled.", "ok");
      load();
    } catch {
      showToast?.("Failed to cancel appointment.", "err");
    }
  };

  const shift = (dir) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + dir * (view === "day" ? 1 : 7));
    setAnchor(d);
  };

  const apptsFor = (day, hour, technicianId) => appointments.filter(a => {
    const start = new Date(a.start_at);
    return a.technician_id === technicianId && start.getFullYear() === day.getFullYear()
      && start.getMonth() === day.getMonth() && start.getDate() === day.getDate()
      && start.getHours() === hour;
  });

  // day view: columns = technicians; week view: columns = days (single technician chosen implicitly per row)
  const columns = view === "day" ? technicians.map(t => ({ key: t.id, label: t.name, day: days[0] }))
    : days.flatMap(d => technicians.map(t => ({ key: `${d.toDateString()}-${t.id}`, label: `${fmtDay(d)} · ${t.name}`, day: d, techId: t.id })));

  return (
    <div style={{ display: "flex", gap: 20 }}>
      {/* Unscheduled sidebar */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: brand.text, marginBottom: 10 }}>Unscheduled Tickets</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "35vh", overflowY: "auto", marginBottom: 20 }}>
          {unscheduled.length === 0 && <div style={{ color: brand.muted, fontSize: 12 }}>All tickets scheduled.</div>}
          {unscheduled.map(t => (
            <div key={t.id}
              draggable
              onDragStart={() => setDragging(t)}
              onDragEnd={() => setDragging(null)}
              style={{ background: "#fff", border: `1px solid ${brand.border}`, borderLeft: `3px solid ${brand.blue}`, borderRadius: "var(--dispatch-radius-md)", padding: "8px 10px", cursor: "grab", fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: brand.text, marginBottom: 2 }}>{t.title || "(No title)"}</div>
              <div style={{ color: brand.muted, fontSize: 11 }}>{t.id}</div>
            </div>
          ))}
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, color: brand.text, marginBottom: 10 }}>Leads to Follow Up</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "35vh", overflowY: "auto" }}>
          {leadsToFollowUp.length === 0 && <div style={{ color: brand.muted, fontSize: 12 }}>No follow-ups pending.</div>}
          {leadsToFollowUp.map(l => (
            <div key={`lead-${l.id}`}
              draggable
              onDragStart={() => setDragging({ id: l.id, isLead: true })}
              onDragEnd={() => setDragging(null)}
              style={{ background: "#fff", border: `1px solid ${brand.border}`, borderLeft: `3px solid ${brand.lead}`, borderRadius: "var(--dispatch-radius-md)", padding: "8px 10px", cursor: "grab", fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: brand.text, marginBottom: 2 }}>{l.business_name}</div>
              <div style={{ color: brand.muted, fontSize: 11 }}>{l.follow_up_date ? `Follow up ${l.follow_up_date}` : "Lead"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => shift(-1)} style={{ padding: "5px 10px", borderRadius: "var(--dispatch-radius-md)", border: `1px solid ${brand.border}`, background: "#fff", cursor: "pointer" }}>←</button>
            <button onClick={() => setAnchor(new Date())} style={{ padding: "5px 12px", borderRadius: "var(--dispatch-radius-md)", border: `1px solid ${brand.border}`, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Today</button>
            <button onClick={() => shift(1)} style={{ padding: "5px 10px", borderRadius: "var(--dispatch-radius-md)", border: `1px solid ${brand.border}`, background: "#fff", cursor: "pointer" }}>→</button>
            <span style={{ marginLeft: 10, fontWeight: 700, color: brand.text }}>{fmtDay(rangeStart)}{view === "week" ? ` – ${fmtDay(new Date(rangeEnd.getTime() - 86400000))}` : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["day", "week"].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: "5px 14px", borderRadius: "var(--dispatch-radius-md)", border: `1.5px solid ${view === v ? brand.blue : brand.border}`, background: view === v ? brand.blue : "#fff", color: view === v ? "#fff" : brand.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: brand.muted, padding: "60px 0", textAlign: "center" }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${brand.border}`, borderRadius: "var(--dispatch-radius-md)" }}>
            {/* Header row (technician/day labels) — stays fixed above the scrollable hour rows */}
            <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${columns.length}, minmax(160px, 1fr))` }}>
              <div style={{ background: brand.bg, borderBottom: `1px solid ${brand.border}` }} />
              {columns.map(col => (
                <div key={col.key} style={{ background: brand.bg, borderBottom: `1px solid ${brand.border}`, borderLeft: `1px solid ${brand.border}`, padding: "8px 10px", fontSize: 12, fontWeight: 700, color: brand.text, textAlign: "center" }}>
                  {col.label}
                </div>
              ))}
            </div>
            {/* Hour rows — scrollable, full 24h, defaults to scrolled-to-business-hours
                (see the scrollTop effect above) so no appointment at any hour is ever
                unreachable/invisible regardless of when it was scheduled. */}
            <div ref={gridScrollRef} style={{ maxHeight: ROW_HEIGHT * 11, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${columns.length}, minmax(160px, 1fr))` }}>
                {HOURS.map(hour => (
                  <div key={hour} style={{ display: "contents" }}>
                    <div style={{ borderTop: `1px solid ${brand.border}`, padding: "6px 8px", fontSize: 11, color: brand.muted, textAlign: "right" }}>
                      {hour % 12 === 0 ? 12 : hour % 12}{hour < 12 ? "am" : "pm"}
                    </div>
                    {columns.map(col => {
                      const techId = view === "day" ? col.key : col.techId;
                      const day = col.day;
                      const slotAppts = apptsFor(day, hour, techId);
                      return (
                        <div key={`${col.key}-${hour}`}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => handleDropOnSlot(day, hour, techId)}
                          style={{ borderTop: `1px solid ${brand.border}`, borderLeft: `1px solid ${brand.border}`, minHeight: ROW_HEIGHT, padding: 4, background: dragging ? "#f0f6ff" : "#fff" }}>
                          {slotAppts.map(a => (
                            <div key={a.id}
                              draggable
                              onDragStart={() => setDragging({ ...a, rescheduling: true })}
                              onDragEnd={() => setDragging(null)}
                              style={{ background: a.lead_id ? brand.lead : brand.blue, color: "#fff", borderRadius: "var(--dispatch-radius-md)", padding: "4px 6px", fontSize: 11, marginBottom: 3, cursor: "grab" }}
                              title={a.notes}>
                              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.lead_id ? (a.lead_business_name || `Lead #${a.lead_id}`) : (a.ticket_title || a.ticket_id)}</div>
                              <button onClick={() => handleCancel(a.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 10, padding: 0, marginTop: 2 }}>Cancel</button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
