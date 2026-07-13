import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import ReportsPage from "../ReportsPage.jsx";

vi.mock("../api/reports.js", () => ({
  getRevenueReport: vi.fn().mockResolvedValue({ by_month: [], by_client: [], grand_total_billed: 0, grand_total_paid: 0 }),
  getTechnicianReport: vi.fn().mockResolvedValue({ rows: [] }),
  getSLAReport: vi.fn().mockResolvedValue({ rows: [], overall_compliance_pct: 0 }),
  getARAgingReport: vi.fn().mockResolvedValue({
    as_of: "2026-07-03",
    buckets: [
      { label: "Current", count: 0, total: 0 },
      { label: "1-30", count: 1, total: 150 },
      { label: "31-60", count: 0, total: 0 },
      { label: "61-90", count: 0, total: 0 },
      { label: "90+", count: 0, total: 0 },
    ],
    invoices: [
      { invoice_id: "INV-2026-00001", client_name: "Acme Corp", due_date: "2026-06-01", days_overdue: 15, balance: 150, bucket: "1-30" },
    ],
    grand_total_outstanding: 150,
  }),
  getQuoteConversionReport: vi.fn().mockResolvedValue({
    by_status: [{ status: "Approved", count: 2, total_value: 500 }],
    approved_count: 2,
    ticket_created_count: 1,
    invoice_converted_count: 1,
    approval_to_ticket_rate: 50,
    approval_to_invoice_rate: 50,
    avg_approval_to_ticket_hours: 3.5,
    avg_ticket_to_invoice_hours: 12,
    approved_value: 500,
    invoiced_value: 250,
  }),
  revenueCsvUrl: vi.fn(() => "/reports/revenue/csv"),
  technicianCsvUrl: vi.fn(() => "/reports/technician/csv"),
  slaCsvUrl: vi.fn(() => "/reports/sla/csv"),
  arAgingCsvUrl: vi.fn(() => "/reports/ar-aging/csv"),
  quoteConversionCsvUrl: vi.fn(() => "/reports/quote-conversion/csv"),
}));
vi.mock("../api/client.js", () => ({ downloadWithAuth: vi.fn() }));

import { getARAgingReport, getQuoteConversionReport, getSLAReport } from "../api/reports.js";

test("AR Aging tab renders bucket and invoice data from the API", async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("AR Aging"));

  expect(await screen.findByText("INV-2026-00001")).toBeInTheDocument();
  expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  expect(getARAgingReport).toHaveBeenCalled();
});

test("AR Aging tab is hidden when the ar_aging feature is disabled", async () => {
  render(<ReportsPage features={{ ar_aging: false }} />);
  expect(await screen.findByText("Revenue")).toBeInTheDocument();
  expect(screen.queryByText("AR Aging")).not.toBeInTheDocument();
});

test("Quote Conversion tab renders funnel counts and by-status table from the API", async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("Quote Conversion"));

  expect(await screen.findByText("Approved", { selector: "td" })).toBeInTheDocument();
  expect(getQuoteConversionReport).toHaveBeenCalled();
  expect(screen.getByText("↓ Export CSV")).toBeInTheDocument();
});

test("Quote Conversion tab shows Rejected/Expired counts alongside the funnel", async () => {
  getQuoteConversionReport.mockResolvedValueOnce({
    by_status: [
      { status: "Approved", count: 2, total_value: 500 },
      { status: "Rejected", count: 3, total_value: 300 },
      { status: "Expired", count: 1, total_value: 100 },
    ],
    approved_count: 2,
    ticket_created_count: 1,
    invoice_converted_count: 1,
    approval_to_ticket_rate: 50,
    approval_to_invoice_rate: 50,
    avg_approval_to_ticket_hours: 3.5,
    avg_ticket_to_invoice_hours: 12,
    approved_value: 500,
    invoiced_value: 250,
  });
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("Quote Conversion"));

  const rejectedLabel = await screen.findByText("Rejected:");
  const summaryRow = rejectedLabel.closest("div").parentElement;
  expect(summaryRow.textContent).toBe("Rejected: 3Expired: 1");
});

test("Quote Conversion tab shows 0 for Rejected/Expired when there are none in the by-status data", async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("Quote Conversion"));

  const rejectedLabel = await screen.findByText("Rejected:");
  const summaryRow = rejectedLabel.closest("div").parentElement;
  expect(summaryRow.textContent).toBe("Rejected: 0Expired: 0");
});

test("Quote Conversion tab is hidden when the quotes feature is disabled", async () => {
  render(<ReportsPage features={{ quotes: false }} />);
  expect(await screen.findByText("Revenue")).toBeInTheDocument();
  expect(screen.queryByText("Quote Conversion")).not.toBeInTheDocument();
});

test("SLA Compliance tab shows a friendly empty state instead of a bare 0% when there's no resolved-ticket data", async () => {
  getSLAReport.mockResolvedValueOnce({
    rows: [
      { priority: "Urgent", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
      { priority: "High", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
      { priority: "Medium", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
      { priority: "Low", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
    ],
    overall_compliance_pct: 0,
  });
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("SLA Compliance"));

  expect(await screen.findByText("No resolved tickets for selected period.")).toBeInTheDocument();
  expect(screen.queryByText("Overall Compliance")).not.toBeInTheDocument();
});

test("SLA Compliance tab renders the table and overall compliance when there is real data", async () => {
  getSLAReport.mockResolvedValueOnce({
    rows: [
      { priority: "Urgent", total: 3, within_sla: 2, breached: 1, no_sla_set: 0, compliance_pct: 66.7 },
      { priority: "High", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
      { priority: "Medium", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
      { priority: "Low", total: 0, within_sla: 0, breached: 0, no_sla_set: 0, compliance_pct: 0 },
    ],
    overall_compliance_pct: 66.7,
  });
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("SLA Compliance"));

  const heading = await screen.findByText("Overall Compliance");
  expect(heading.parentElement.textContent).toContain("66.7%");
  expect(screen.queryByText("No resolved tickets for selected period.")).not.toBeInTheDocument();
});
