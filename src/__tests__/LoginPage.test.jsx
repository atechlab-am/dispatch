import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import LoginPage from "../LoginPage.jsx";

vi.mock("../api/auth.js", () => ({
  login: vi.fn(),
  verifyLogin2fa: vi.fn(),
}));
vi.mock("../api/client.js", () => ({
  setTokens: vi.fn(),
}));
vi.mock("../api/loginBranding.js", () => ({
  getLoginBrandingPublic: vi.fn().mockResolvedValue({
    company_name: "Your Company", subtitle: "internal use only",
    primary_color: "#2563EB", accent_color: "#F59E0B",
    text_color: "#0D1B2A", muted_color: "#5B6D82", on_color_text: "#FFFFFF",
    logo_url: "",
  }),
}));

import { login, verifyLogin2fa } from "../api/auth.js";
import { setTokens } from "../api/client.js";
import { getLoginBrandingPublic } from "../api/loginBranding.js";

// Helper: step through the email screen to reach the password screen.
function submitEmail(email = "a@test.com") {
  fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /Next/i }));
}

test("email step is shown first, with no password field visible", async () => {
  render(<LoginPage onLogin={() => {}} />);
  expect(await screen.findByPlaceholderText("Email address")).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
});

test("continuing past the email step reveals the password field", async () => {
  render(<LoginPage onLogin={() => {}} />);
  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");

  expect(await screen.findByPlaceholderText("Password")).toBeInTheDocument();
  expect(screen.getByText("a@test.com")).toBeInTheDocument();
});

test("use another account returns to the email step", async () => {
  render(<LoginPage onLogin={() => {}} />);
  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  await screen.findByPlaceholderText("Password");

  fireEvent.click(screen.getByText("Use another account"));
  expect(await screen.findByPlaceholderText("Email address")).toBeInTheDocument();
});

test("logs in directly when 2FA is not required", async () => {
  login.mockResolvedValue({ requires_2fa: false, access_token: "acc", refresh_token: "ref" });
  const onLogin = vi.fn();
  render(<LoginPage onLogin={onLogin} />);

  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

  await waitFor(() => expect(setTokens).toHaveBeenCalledWith("acc", "ref"));
  expect(onLogin).toHaveBeenCalled();
  expect(verifyLogin2fa).not.toHaveBeenCalled();
});

test("shows the 2FA code step when the account requires it", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  render(<LoginPage onLogin={() => {}} />);

  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

  expect(await screen.findByText(/Two-factor verification/i)).toBeInTheDocument();
});

test("submitting the correct code completes login", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  verifyLogin2fa.mockResolvedValue({ access_token: "acc", refresh_token: "ref" });
  const onLogin = vi.fn();
  render(<LoginPage onLogin={onLogin} />);

  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
  await screen.findByText(/Two-factor verification/i);

  fireEvent.change(screen.getByPlaceholderText("Code"), { target: { value: "654321" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify/i }));

  await waitFor(() => expect(verifyLogin2fa).toHaveBeenCalledWith("pending-token", "654321"));
  expect(setTokens).toHaveBeenCalledWith("acc", "ref");
  expect(onLogin).toHaveBeenCalled();
});

test("shows an error and stays on the code step when the code is wrong", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  verifyLogin2fa.mockRejectedValue(new Error("bad code"));
  render(<LoginPage onLogin={() => {}} />);

  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
  await screen.findByText(/Two-factor verification/i);

  fireEvent.change(screen.getByPlaceholderText("Code"), { target: { value: "000000" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify/i }));

  expect(await screen.findByText("Invalid authentication code.")).toBeInTheDocument();
});

test("back button from the code step returns to the password step", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  render(<LoginPage onLogin={() => {}} />);

  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
  await screen.findByText(/Two-factor verification/i);

  fireEvent.click(screen.getByRole("button", { name: /Back/i }));
  expect(await screen.findByPlaceholderText("Password")).toBeInTheDocument();
});

test("shows an error on wrong password", async () => {
  login.mockRejectedValue(new Error("nope"));
  render(<LoginPage onLogin={() => {}} />);

  await screen.findByPlaceholderText("Email address");
  submitEmail("a@test.com");
  fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

  expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
});

test("renders company name and subtitle fetched from the public branding endpoint", async () => {
  getLoginBrandingPublic.mockResolvedValueOnce({
    company_name: "Acme IT", subtitle: "staff sign-in only",
    primary_color: "#123456", accent_color: "#abcdef",
    text_color: "#111111", muted_color: "#222222", on_color_text: "#FFFFFF",
    logo_url: "",
  });
  render(<LoginPage onLogin={() => {}} />);

  expect(await screen.findByText("Acme")).toBeInTheDocument();
  expect(screen.getByText(/staff sign-in only/)).toBeInTheDocument();
});

test("falls back to defaults when the branding fetch fails", async () => {
  getLoginBrandingPublic.mockRejectedValueOnce(new Error("offline"));
  render(<LoginPage onLogin={() => {}} />);

  expect(await screen.findByText(/internal use only/)).toBeInTheDocument();
});
