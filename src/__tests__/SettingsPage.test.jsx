import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import SettingsPage from "../SettingsPage.jsx";

vi.mock("../api/users.js", () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  changeOwnPassword: vi.fn(),
}));

vi.mock("../api/documents.js", () => ({
  listDocuments: vi.fn().mockResolvedValue([]),
  uploadDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  downloadUrl: vi.fn(id => `/api/documents/${id}/download`),
}));

vi.mock("../api/portal.js", () => ({
  listPortalAccounts: vi.fn().mockResolvedValue([]),
  createPortalAccount: vi.fn(),
  updatePortalAccount: vi.fn(),
  deletePortalAccount: vi.fn(),
}));

vi.mock("../api/clients.js", () => ({
  listClients: vi.fn().mockResolvedValue([]),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
}));

import { listUsers, createUser, changeOwnPassword } from "../api/users.js";

const adminUser = { id: 1, name: "Admin", email: "admin@test.com", role: "admin", active: true };
const techUser  = { id: 2, name: "Tech",  email: "tech@test.com",  role: "technician", active: true };

describe("SettingsPage — Users tab (admin)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows Users tab for admin and lists users", async () => {
    listUsers.mockResolvedValue([adminUser, techUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} />);
    expect(await screen.findByText("admin@test.com")).toBeInTheDocument();
    expect(screen.getByText("tech@test.com")).toBeInTheDocument();
  });

  it("does not show Users tab for technician", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Users$/i })).not.toBeInTheDocument();
    // Password tab + submit button should both be present (two "Change Password" elements is correct)
    expect(screen.getAllByRole("button", { name: /Change Password/i })).toHaveLength(2);
  });

  it("shows Add User form for admin", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} />);
    await screen.findByText("admin@test.com");
    expect(screen.getByPlaceholderText("Full name")).toBeInTheDocument();
  });

  it("calls createUser and shows new user on submit", async () => {
    listUsers.mockResolvedValue([adminUser]);
    const newUser = { id: 3, name: "New User", email: "new@test.com", role: "technician", active: true };
    createUser.mockResolvedValue(newUser);
    const showToast = vi.fn();
    render(<SettingsPage user={adminUser} showToast={showToast} />);
    await screen.findByText("admin@test.com");

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "New User" } });
    fireEvent.change(screen.getByPlaceholderText("user@atechsolutions.org"), { target: { value: "new@test.com" } });
    fireEvent.change(screen.getByPlaceholderText("Temporary password"), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: /\+ Add/i }));

    await waitFor(() => expect(createUser).toHaveBeenCalledWith({
      name: "New User",
      email: "new@test.com",
      password: "newpass123",
      role: "technician",
    }));
    expect(await screen.findByText("new@test.com")).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith("User created.", "ok");
  });
});

describe("SettingsPage — Change Password tab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the password form", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} />);
    expect(screen.getByPlaceholderText("Your current password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Repeat new password")).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    const showToast = vi.fn();
    render(<SettingsPage user={techUser} showToast={showToast} />);
    fireEvent.change(screen.getByPlaceholderText("Your current password"), { target: { value: "current" } });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "newpass1" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat new password"), { target: { value: "different" } });
    fireEvent.submit(screen.getByPlaceholderText("Your current password").closest("form"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("New passwords do not match.", "err"));
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it("shows error when new password is too short", async () => {
    const showToast = vi.fn();
    render(<SettingsPage user={techUser} showToast={showToast} />);
    fireEvent.change(screen.getByPlaceholderText("Your current password"), { target: { value: "current" } });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "short" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat new password"), { target: { value: "short" } });
    fireEvent.submit(screen.getByPlaceholderText("Your current password").closest("form"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("New password must be at least 8 characters.", "err"));
  });

  it("calls changeOwnPassword and shows success toast", async () => {
    changeOwnPassword.mockResolvedValue({});
    const showToast = vi.fn();
    render(<SettingsPage user={techUser} showToast={showToast} />);
    fireEvent.change(screen.getByPlaceholderText("Your current password"), { target: { value: "oldpass" } });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat new password"), { target: { value: "newpass123" } });
    fireEvent.submit(screen.getByPlaceholderText("Your current password").closest("form"));
    await waitFor(() => expect(changeOwnPassword).toHaveBeenCalledWith("oldpass", "newpass123"));
    expect(showToast).toHaveBeenCalledWith("Password changed successfully.", "ok");
  });

  it("shows API error on failure", async () => {
    changeOwnPassword.mockRejectedValue({ response: { data: { detail: "Current password is incorrect" } } });
    const showToast = vi.fn();
    render(<SettingsPage user={techUser} showToast={showToast} />);
    fireEvent.change(screen.getByPlaceholderText("Your current password"), { target: { value: "wrongpass" } });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat new password"), { target: { value: "newpass123" } });
    fireEvent.submit(screen.getByPlaceholderText("Your current password").closest("form"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Current password is incorrect", "err"));
  });
});
