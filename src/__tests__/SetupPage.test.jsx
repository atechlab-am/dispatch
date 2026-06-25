import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import SetupPage from "../SetupPage.jsx";

vi.mock("../api/setup.js", () => ({
  completeSetup: vi.fn(),
}));

import { completeSetup } from "../api/setup.js";

describe("SetupPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the setup form", () => {
    render(<SetupPage onComplete={() => {}} />);
    expect(screen.getByPlaceholderText(/Anthony Martins/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@atechsolutions/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/At least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Repeat your password/i)).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    render(<SetupPage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin" } });
    fireEvent.change(screen.getByPlaceholderText(/you@atechsolutions/i), { target: { value: "a@a.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password1" } });
    fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "different1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Admin Account/i }));
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(completeSetup).not.toHaveBeenCalled();
  });

  it("shows error when password is too short", async () => {
    render(<SetupPage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin" } });
    fireEvent.change(screen.getByPlaceholderText(/you@atechsolutions/i), { target: { value: "a@a.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "short" } });
    fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Admin Account/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(completeSetup).not.toHaveBeenCalled();
  });

  it("calls completeSetup and onComplete on valid submission", async () => {
    completeSetup.mockResolvedValue({ ok: true });
    const onComplete = vi.fn();
    render(<SetupPage onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin User" } });
    fireEvent.change(screen.getByPlaceholderText(/you@atechsolutions/i), { target: { value: "admin@test.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "goodpassword" } });
    fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "goodpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Admin Account/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(completeSetup).toHaveBeenCalledWith({
      name: "Admin User",
      email: "admin@test.com",
      password: "goodpassword",
    });
  });

  it("shows API error message on failure", async () => {
    completeSetup.mockRejectedValue({ response: { data: { detail: "Setup already complete" } } });
    render(<SetupPage onComplete={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Anthony Martins/i), { target: { value: "Admin" } });
    fireEvent.change(screen.getByPlaceholderText(/you@atechsolutions/i), { target: { value: "a@a.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByPlaceholderText(/Repeat your password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Admin Account/i }));
    expect(await screen.findByText(/Setup already complete/i)).toBeInTheDocument();
  });
});
