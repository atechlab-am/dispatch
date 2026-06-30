import client from "./client.js";

export const getRevenueReport = (params = {}) =>
  client.get("/reports/revenue", { params }).then(r => r.data);

export const getTechnicianReport = (params = {}) =>
  client.get("/reports/technician", { params }).then(r => r.data);

export const getSLAReport = (params = {}) =>
  client.get("/reports/sla", { params }).then(r => r.data);

export const revenueCsvUrl = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return `/reports/revenue/csv${q.toString() ? "?" + q : ""}`;
};

export const technicianCsvUrl = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return `/reports/technician/csv${q.toString() ? "?" + q : ""}`;
};

export const slaCsvUrl = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return `/reports/sla/csv${q.toString() ? "?" + q : ""}`;
};
