import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import SetupPage from "../SetupPage.jsx";

vi.mock("../api/setup.js", () => ({
  completeSetup: vi.fn(),
}));

import { completeSetup } from "../api/setup.js";

const fillAccountStep = () => {
  fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin User" } });
  fireEvent.change(screen.getByPlaceholderText(/you@example/i), { target: { value: "admin@test.com" } });
  fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "goodpassword" } });
  fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "goodpassword" } });
};

describe("SetupPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders step 1: the admin account form", () => {
    render(<SetupPage onComplete={() => {}} />);
    expect(screen.getByPlaceholderText(/Anthony Martins/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/At least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Repeat your password/i)).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    render(<SetupPage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin" } });
    fireEvent.change(screen.getByPlaceholderText(/you@example/i), { target: { value: "a@a.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "different1" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(completeSetup).not.toHaveBeenCalled();
  });

  it("shows error when password is too short", async () => {
    render(<SetupPage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin" } });
    fireEvent.change(screen.getByPlaceholderText(/you@example/i), { target: { value: "a@a.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "short" } });
    fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(completeSetup).not.toHaveBeenCalled();
  });

  it("advances to step 2 (branding) after a valid account step", async () => {
    render(<SetupPage onComplete={() => {}} />);
    fillAccountStep();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(await screen.findByPlaceholderText("Your Company")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Finish Setup/i })).toBeInTheDocument();
  });

  it("submits account + branding together on finish", async () => {
    completeSetup.mockResolvedValue({ ok: true });
    const onComplete = vi.fn();
    render(<SetupPage onComplete={onComplete} />);
    fillAccountStep();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await screen.findByPlaceholderText("Your Company");
    fireEvent.change(screen.getByPlaceholderText("Your Company"), { target: { value: "Acme Inc" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish Setup/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(completeSetup).toHaveBeenCalledWith({
      name: "Admin User",
      email: "admin@test.com",
      password: "goodpassword",
      branding: {
        company_name: "Acme Inc",
        tagline: "",
        primary_color: "#2563EB",
        accent_color: "#F59E0B",
        logo_url: "",
      },
    });
  });

  it("skipping branding submits with branding: null", async () => {
    completeSetup.mockResolvedValue({ ok: true });
    const onComplete = vi.fn();
    render(<SetupPage onComplete={onComplete} />);
    fillAccountStep();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await screen.findByText(/Skip for now/i);
    fireEvent.click(screen.getByText(/Skip for now/i));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(completeSetup).toHaveBeenCalledWith({
      name: "Admin User",
      email: "admin@test.com",
      password: "goodpassword",
      branding: null,
    });
  });

  it("shows API error message on failure", async () => {
    completeSetup.mockRejectedValue({ response: { data: { detail: "Setup already complete" } } });
    render(<SetupPage onComplete={() => {}} />);
    fillAccountStep();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await screen.findByText(/Skip for now/i);
    fireEvent.click(screen.getByText(/Skip for now/i));
    expect(await screen.findByText(/Setup already complete/i)).toBeInTheDocument();
  });
});
