export const fmt = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const calcServiceTotal = (svc) => {
  if (!svc.serviceId) return 0;
  if (svc.type === "hourly")   return 0;
  if (svc.type === "per_unit") return (svc.rate || 0) * (svc.qty || 1);
  if (svc.type === "flat") {
    let t = svc.base || 0;
    if (svc.extraQty && svc.perUnit) t += svc.extraQty * svc.perUnit;
    return t;
  }
  return 0;
};

export const calcHourTotal = (logs) =>
  logs.reduce((s, l) => s + (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0), 0);
