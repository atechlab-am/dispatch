import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import DocsPage from "../DocsPage.jsx";

vi.mock("../api/docs.js", () => ({
  listDocs: vi.fn(),
  getDoc: vi.fn(),
}));

import { listDocs, getDoc } from "../api/docs.js";

const PAGES = [
  { slug: "getting-started", title: "Getting Started" },
  { slug: "features", title: "Features" },
  { slug: "operations", title: "Operations" },
];

describe("DocsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocs.mockResolvedValue(PAGES);
    getDoc.mockImplementation((slug) =>
      Promise.resolve({ slug, title: slug, content: `# ${slug}\n\nSome **bold** text and a [link](../README.md).\n\n- item one\n- item two` })
    );
  });

  it("lists doc pages and loads the first one by default", async () => {
    render(<DocsPage />);
    expect(await screen.findByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    await waitFor(() => expect(getDoc).toHaveBeenCalledWith("getting-started"));
  });

  it("switches pages when a sidebar item is clicked", async () => {
    render(<DocsPage />);
    await screen.findByText("Getting Started");
    fireEvent.click(screen.getByText("Features"));
    await waitFor(() => expect(getDoc).toHaveBeenCalledWith("features"));
  });

  it("renders markdown content: headings, bold, lists, links", async () => {
    render(<DocsPage />);
    await screen.findByText("Getting Started");
    expect(await screen.findByRole("heading", { name: "getting-started" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("item one")).toBeInTheDocument();
    expect(screen.getByText("item two")).toBeInTheDocument();
    expect(screen.getByText("link")).toBeInTheDocument();
  });
});
