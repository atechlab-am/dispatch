import { useState, useEffect, useRef } from "react";
import { listNotifications, getUnreadCount, markRead, markAllRead } from "./api/notifications.js";

const POLL_INTERVAL = 30 * 1000; // 30 seconds

export default function NotificationBell({ user, navigate }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const poll = () => getUnreadCount().then(d => setCount(d.count)).catch(() => {});
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    listNotifications().then(setItems).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleItemClick = async (n) => {
    if (!n.read) {
      await markRead(n.id);
      setCount(c => Math.max(0, c - 1));
      setItems(prev => prev.map(i => i.id === n.id ? { ...i, read: true } : i));
    }
    if (n.ticket_id) navigate(`/tickets/${n.ticket_id}`);
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    setCount(0);
    setItems(prev => prev.map(i => ({ ...i, read: true })));
  };

  if (!user) return null;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 6, display: "flex", alignItems: "center", color: "#0f172a" }}
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="dispatch-pill" style={{ position: "absolute", top: 2, right: 2, background: "#c0392b", color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 340, maxHeight: 420, overflowY: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "var(--dispatch-radius-lg)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Notifications</span>
            {items.some(i => !i.read) && (
              <button onClick={handleMarkAllRead} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No notifications yet.</div>
          )}
          {items.map(n => (
            <div
              key={n.id}
              onClick={() => handleItemClick(n)}
              style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: n.read ? "#fff" : "#f0f6ff" }}
            >
              <div style={{ fontSize: 13, color: "#0f172a", marginBottom: 4 }}>{n.message}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
