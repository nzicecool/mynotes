import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock("@tauri-apps/api/core", () => native);
import { desktopApi } from "./api";

beforeEach(() => { native.invoke.mockReset().mockResolvedValue(undefined); native.isTauri.mockReturnValue(true); });

describe("desktop native command boundary", () => {
  it("sends PIN recovery to the native vault without an account", async () => {
    native.invoke.mockResolvedValue({ codes: ["code"] });
    await desktopApi.setup("001234");
    expect(native.invoke).toHaveBeenLastCalledWith("setup_vault", { pin: "001234" });
    await desktopApi.recover("RECOVERY-CODE", "006789");
    expect(native.invoke).toHaveBeenLastCalledWith("recover_vault", { code: "RECOVERY-CODE", newPin: "006789" });
  });
  it("lets the native dialog choose backup paths", async () => {
    await desktopApi.exportBackup();
    expect(native.invoke).toHaveBeenLastCalledWith("export_backup", undefined);
    await desktopApi.restoreBackup("CODE", "123456");
    expect(native.invoke).toHaveBeenLastCalledWith("restore_backup", { code: "CODE", newPin: "123456" });
  });
  it("preserves native errors instead of falling back to an unencrypted mock", async () => {
    native.invoke.mockRejectedValue("Vault is locked");
    await expect(desktopApi.listNotes()).rejects.toBe("Vault is locked");
  });
  it("rejects storage access outside the desktop runtime", async () => {
    native.isTauri.mockReturnValue(false);
    await expect(desktopApi.status()).rejects.toThrow("Open MyNotes Desktop");
    expect(native.invoke).not.toHaveBeenCalled();
  });
});
