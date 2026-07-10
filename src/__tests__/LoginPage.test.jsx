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
    company_name: "ATech Solutions", subtitle: "internal use only",
    primary_color: "#1A5CBA", accent_color: "#E8A020", logo_url: "",
  }),
}));

import { login, verifyLogin2fa } from "../api/auth.js";
import { setTokens } from "../api/client.js";
import { getLoginBrandingPublic } from "../api/loginBranding.js";

test("logs in directly when 2FA is not required", async () => {
  login.mockResolvedValue({ requires_2fa: false, access_token: "acc", refresh_token: "ref" });
  const onLogin = vi.fn();
  render(<LoginPage onLogin={onLogin} />);

  fireEvent.change(screen.getByPlaceholderText("you@atechsolutions.org"), { target: { value: "a@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

  await waitFor(() => expect(setTokens).toHaveBeenCalledWith("acc", "ref"));
  expect(onLogin).toHaveBeenCalled();
  expect(verifyLogin2fa).not.toHaveBeenCalled();
});

test("shows the 2FA code step when the account requires it", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  render(<LoginPage onLogin={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText("you@atechsolutions.org"), { target: { value: "a@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

  expect(await screen.findByText(/Two-Factor Verification/i)).toBeInTheDocument();
});

test("submitting the correct code completes login", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  verifyLogin2fa.mockResolvedValue({ access_token: "acc", refresh_token: "ref" });
  const onLogin = vi.fn();
  render(<LoginPage onLogin={onLogin} />);

  fireEvent.change(screen.getByPlaceholderText("you@atechsolutions.org"), { target: { value: "a@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
  await screen.findByText(/Two-Factor Verification/i);

  fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "654321" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify/i }));

  await waitFor(() => expect(verifyLogin2fa).toHaveBeenCalledWith("pending-token", "654321"));
  expect(setTokens).toHaveBeenCalledWith("acc", "ref");
  expect(onLogin).toHaveBeenCalled();
});

test("shows an error and stays on the code step when the code is wrong", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  verifyLogin2fa.mockRejectedValue(new Error("bad code"));
  render(<LoginPage onLogin={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText("you@atechsolutions.org"), { target: { value: "a@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
  await screen.findByText(/Two-Factor Verification/i);

  fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "000000" } });
  fireEvent.click(screen.getByRole("button", { name: /Verify/i }));

  expect(await screen.findByText("Invalid authentication code.")).toBeInTheDocument();
});

test("back button returns to the password step", async () => {
  login.mockResolvedValue({ requires_2fa: true, login_token: "pending-token" });
  render(<LoginPage onLogin={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText("you@atechsolutions.org"), { target: { value: "a@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
  await screen.findByText(/Two-Factor Verification/i);

  fireEvent.click(screen.getByRole("button", { name: /Back/i }));
  expect(await screen.findByPlaceholderText("you@atechsolutions.org")).toBeInTheDocument();
});

test("shows an error on wrong password", async () => {
  login.mockRejectedValue(new Error("nope"));
  render(<LoginPage onLogin={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText("you@atechsolutions.org"), { target: { value: "a@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

  expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
});

test("renders company name and subtitle fetched from the public branding endpoint", async () => {
  getLoginBrandingPublic.mockResolvedValueOnce({
    company_name: "Acme IT", subtitle: "staff sign-in only",
    primary_color: "#123456", accent_color: "#abcdef", logo_url: "",
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
