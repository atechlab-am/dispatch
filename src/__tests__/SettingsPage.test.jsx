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

vi.mock("../api/cannedResponses.js", () => ({
  listCannedResponses: vi.fn().mockResolvedValue([]),
  createCannedResponse: vi.fn(),
  updateCannedResponse: vi.fn(),
  deleteCannedResponse: vi.fn(),
}));

vi.mock("../api/materials.js", () => ({
  listMaterials: vi.fn().mockResolvedValue([]),
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
}));

vi.mock("../api/backups.js", () => ({
  listBackupRuns: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  triggerBackup: vi.fn(),
  listAvailableBackups: vi.fn().mockResolvedValue([]),
  restoreBackup: vi.fn(),
}));

vi.mock("../api/auth.js", () => ({
  me: vi.fn().mockResolvedValue({ id: 1, totp_enabled: false }),
  setup2fa: vi.fn(),
  enable2fa: vi.fn(),
  disable2fa: vi.fn(),
}));

import { listUsers, createUser, changeOwnPassword } from "../api/users.js";
import { me, setup2fa, enable2fa, disable2fa } from "../api/auth.js";
import { listBackupRuns, triggerBackup, listAvailableBackups, restoreBackup } from "../api/backups.js";

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

  it("shows Canned Responses tab for admin when the feature is enabled", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ canned_responses: true }} />);
    await screen.findByText("admin@test.com");
    expect(screen.getByRole("button", { name: /Canned Responses/i })).toBeInTheDocument();
  });

  it("hides Canned Responses tab when the feature is disabled", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ canned_responses: false }} />);
    await screen.findByText("admin@test.com");
    expect(screen.queryByRole("button", { name: /Canned Responses/i })).not.toBeInTheDocument();
  });

  it("hides Canned Responses tab for technician regardless of the feature flag", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} features={{ canned_responses: true }} />);
    expect(screen.queryByRole("button", { name: /Canned Responses/i })).not.toBeInTheDocument();
  });

  it("shows Materials tab for admin when the feature is enabled", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ materials: true }} />);
    await screen.findByText("admin@test.com");
    expect(screen.getByRole("button", { name: /Materials/i })).toBeInTheDocument();
  });

  it("hides Materials tab when the feature is disabled", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ materials: false }} />);
    await screen.findByText("admin@test.com");
    expect(screen.queryByRole("button", { name: /Materials/i })).not.toBeInTheDocument();
  });

  it("hides Materials tab for technician regardless of the feature flag", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} features={{ materials: true }} />);
    expect(screen.queryByRole("button", { name: /Materials/i })).not.toBeInTheDocument();
  });

  it("shows Backup tab for admin when the feature is enabled", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ backups: true }} />);
    await screen.findByText("admin@test.com");
    expect(screen.getByRole("button", { name: /Backup/i })).toBeInTheDocument();
  });

  it("hides Backup tab when the feature is disabled", async () => {
    listUsers.mockResolvedValue([adminUser]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ backups: false }} />);
    await screen.findByText("admin@test.com");
    expect(screen.queryByRole("button", { name: /Backup/i })).not.toBeInTheDocument();
  });

  it("hides Backup tab for technician regardless of the feature flag", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} features={{ backups: true }} />);
    expect(screen.queryByRole("button", { name: /Backup/i })).not.toBeInTheDocument();
  });

  it("shows Security tab (available to any role) when 2FA is enabled", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} features={{ two_factor_auth: true }} />);
    expect(screen.getByRole("button", { name: /Security/i })).toBeInTheDocument();
  });

  it("hides Security tab when 2FA feature is disabled", () => {
    render(<SettingsPage user={techUser} showToast={() => {}} features={{ two_factor_auth: false }} />);
    expect(screen.queryByRole("button", { name: /Security/i })).not.toBeInTheDocument();
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

describe("SettingsPage — Security tab (2FA)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an Enable button when 2FA is not yet set up", async () => {
    me.mockResolvedValue({ id: 2, totp_enabled: false });
    render(<SettingsPage user={techUser} showToast={() => {}} features={{ two_factor_auth: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Security/i }));
    expect(await screen.findByText(/Enable Two-Factor Auth/i)).toBeInTheDocument();
  });

  it("walks through setup: QR code shown, then code entry, then backup codes", async () => {
    me.mockResolvedValue({ id: 2, totp_enabled: false });
    setup2fa.mockResolvedValue({ secret: "ABCDEF123456", qr_code: "data:image/png;base64,zzz" });
    enable2fa.mockResolvedValue({ backup_codes: ["aaaa1111", "bbbb2222"] });

    render(<SettingsPage user={techUser} showToast={() => {}} features={{ two_factor_auth: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Security/i }));
    fireEvent.click(await screen.findByText(/Enable Two-Factor Auth/i));

    expect(await screen.findByText(/Scan this QR code/i)).toBeInTheDocument();
    expect(screen.getByText("ABCDEF123456")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /^Enable$/i }));

    await waitFor(() => expect(enable2fa).toHaveBeenCalledWith("654321"));
    expect(await screen.findByText(/Save Your Backup Codes/i)).toBeInTheDocument();
    expect(screen.getByText("aaaa1111")).toBeInTheDocument();
    expect(screen.getByText("bbbb2222")).toBeInTheDocument();
  });

  it("shows a rejection toast when the code is wrong", async () => {
    me.mockResolvedValue({ id: 2, totp_enabled: false });
    setup2fa.mockResolvedValue({ secret: "ABCDEF123456", qr_code: "data:image/png;base64,zzz" });
    enable2fa.mockRejectedValue({ response: { data: { detail: "Invalid authentication code" } } });
    const showToast = vi.fn();

    render(<SettingsPage user={techUser} showToast={showToast} features={{ two_factor_auth: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Security/i }));
    fireEvent.click(await screen.findByText(/Enable Two-Factor Auth/i));
    await screen.findByText(/Scan this QR code/i);

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /^Enable$/i }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Invalid authentication code", "err"));
  });

  it("shows an Enabled badge and disable form when already enabled", async () => {
    me.mockResolvedValue({ id: 2, totp_enabled: true });
    disable2fa.mockResolvedValue({});
    const showToast = vi.fn();

    render(<SettingsPage user={techUser} showToast={showToast} features={{ two_factor_auth: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Security/i }));

    expect(await screen.findByText("Enabled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Disable Two-Factor Auth/i }));

    const pwInput = document.querySelector('input[type="password"]');
    fireEvent.change(pwInput, { target: { value: "mypassword" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm Disable/i }));

    await waitFor(() => expect(disable2fa).toHaveBeenCalledWith("mypassword"));
    expect(showToast).toHaveBeenCalledWith("Two-factor authentication disabled.", "ok");
  });
});

describe("SettingsPage — Backup tab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows backup history from the API", async () => {
    listBackupRuns.mockResolvedValue({
      items: [
        { id: 1, started_at: "2026-07-01T00:00:00Z", finished_at: "2026-07-01T00:01:00Z", status: "success", filename: "dispatch-backup-20260701-000000.tar.gz", size_bytes: 2048, error: "", triggered_by: "schedule" },
      ],
      total: 1,
    });
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ backups: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Backup/i }));

    expect(await screen.findByText("dispatch-backup-20260701-000000.tar.gz")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("calls triggerBackup when Backup Now is clicked", async () => {
    listBackupRuns.mockResolvedValue({ items: [], total: 0 });
    triggerBackup.mockResolvedValue({ id: 2, status: "running" });
    const showToast = vi.fn();
    render(<SettingsPage user={adminUser} showToast={showToast} features={{ backups: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Backup/i }));
    await screen.findByText("No backups yet.");

    fireEvent.click(screen.getByRole("button", { name: /Backup Now/i }));

    await waitFor(() => expect(triggerBackup).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith("Backup started.", "ok");
  });

  it("lists backups available on the NAS when requested", async () => {
    listBackupRuns.mockResolvedValue({ items: [], total: 0 });
    listAvailableBackups.mockResolvedValue([
      { filename: "dispatch-backup-20260701-000000.tar.gz", created_at: "2026-07-01T00:00:00Z", size_bytes: 4096 },
    ]);
    render(<SettingsPage user={adminUser} showToast={() => {}} features={{ backups: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Backup/i }));
    await screen.findByText("No backups yet.");

    fireEvent.click(screen.getByRole("button", { name: /List Backups on NAS/i }));

    expect(await screen.findByText("dispatch-backup-20260701-000000.tar.gz")).toBeInTheDocument();
  });

  it("restoring requires a password and calls restoreBackup on confirm", async () => {
    listBackupRuns.mockResolvedValue({ items: [], total: 0 });
    listAvailableBackups.mockResolvedValue([
      { filename: "dispatch-backup-20260701-000000.tar.gz", created_at: "2026-07-01T00:00:00Z", size_bytes: 4096 },
    ]);
    restoreBackup.mockResolvedValue({});
    const showToast = vi.fn();
    render(<SettingsPage user={adminUser} showToast={showToast} features={{ backups: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Backup/i }));
    await screen.findByText("No backups yet.");
    fireEvent.click(screen.getByRole("button", { name: /List Backups on NAS/i }));
    await screen.findByText("dispatch-backup-20260701-000000.tar.gz");

    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    expect(await screen.findByText("Restore from Backup?")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Restore & Overwrite/i });
    expect(confirmBtn).toBeDisabled();

    const pwInput = document.querySelector('input[type="password"]');
    fireEvent.change(pwInput, { target: { value: "adminpass" } });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith("dispatch-backup-20260701-000000.tar.gz", "adminpass"));
    expect(showToast).toHaveBeenCalledWith("Restoring — the app will be briefly unavailable and reload shortly.", "ok");
  });
});
