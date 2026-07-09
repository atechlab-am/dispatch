import client from "./client.js";

export const getRevenueReport = (params = {}) =>
  client.get("/reports/revenue", { params }).then(r => r.data);

export const getTechnicianReport = (params = {}) =>
  client.get("/reports/technician", { params }).then(r => r.data);

export const getSLAReport = (params = {}) =>
  client.get("/reports/sla", { params }).then(r => r.data);

export const getARAgingReport = (params = {}) =>
  client.get("/reports/ar-aging", { params }).then(r => r.data);

export const getQuoteConversionReport = (params = {}) =>
  client.get("/reports/quote-conversion", { params }).then(r => r.data);

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

export const arAgingCsvUrl = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return `/reports/ar-aging/csv${q.toString() ? "?" + q : ""}`;
};

export const quoteConversionCsvUrl = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return `/reports/quote-conversion/csv${q.toString() ? "?" + q : ""}`;
};
