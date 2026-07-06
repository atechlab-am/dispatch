import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import GlobalSearch from "../GlobalSearch.jsx";

vi.mock("../api/search.js", () => ({
  globalSearch: vi.fn().mockResolvedValue({
    tickets: [{ id: "TKT-2026-00001", title: "Printer down", status: "Open", client_name: "Acme" }],
    clients: [],
    invoices: [],
    quotes: [],
  }),
}));

import { globalSearch } from "../api/search.js";

test("typing a query debounces and shows matching results", async () => {
  const navigate = vi.fn();
  render(<GlobalSearch navigate={navigate} />);
  const input = screen.getByPlaceholderText(/search tickets/i);
  fireEvent.change(input, { target: { value: "Acme" } });

  await waitFor(() => expect(globalSearch).toHaveBeenCalledWith("Acme"), { timeout: 1000 });
  expect(await screen.findByText("TKT-2026-00001")).toBeInTheDocument();
});

test("clicking a result navigates and clears the query", async () => {
  const navigate = vi.fn();
  render(<GlobalSearch navigate={navigate} />);
  const input = screen.getByPlaceholderText(/search tickets/i);
  fireEvent.change(input, { target: { value: "Acme" } });

  const row = await screen.findByText("TKT-2026-00001");
  fireEvent.click(row);

  expect(navigate).toHaveBeenCalledWith("/tickets/TKT-2026-00001");
  expect(input.value).toBe("");
});

test("empty query shows no dropdown", () => {
  const navigate = vi.fn();
  render(<GlobalSearch navigate={navigate} />);
  expect(screen.queryByText(/searching/i)).not.toBeInTheDocument();
});
