import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLocalSessionToken, verifyLocalSessionToken } from "./_core/localAuth";

// Mock ENV to provide a stable cookie secret for tests
vi.mock("./_core/env", () => ({
  ENV: {
    cookieSecret: "test-secret-key-for-unit-tests-only",
    appId: "test-app",
    databaseUrl: "",
    oAuthServerUrl: "",
    ownerOpenId: "",
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));

describe("createLocalSessionToken", () => {
  it("creates a non-empty JWT string", async () => {
    const token = await createLocalSessionToken(1, "user@example.com");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    // JWT format: three base64url segments separated by dots
    expect(token.split(".")).toHaveLength(3);
  });

  it("creates different tokens for different users", async () => {
    const token1 = await createLocalSessionToken(1, "alice@example.com");
    const token2 = await createLocalSessionToken(2, "bob@example.com");
    expect(token1).not.toBe(token2);
  });
});

describe("verifyLocalSessionToken", () => {
  it("returns null for undefined token", async () => {
    const result = await verifyLocalSessionToken(undefined);
    expect(result).toBeNull();
  });

  it("returns null for null token", async () => {
    const result = await verifyLocalSessionToken(null);
    expect(result).toBeNull();
  });

  it("returns null for an invalid/tampered token", async () => {
    const result = await verifyLocalSessionToken("not.a.valid.jwt");
    expect(result).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    // Manually crafted token signed with wrong secret — should fail verification
    const result = await verifyLocalSessionToken(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInR5cGUiOiJsb2NhbCJ9.WRONG_SIGNATURE"
    );
    expect(result).toBeNull();
  });

  it("round-trips: creates and verifies a token successfully", async () => {
    const userId = 42;
    const email = "roundtrip@example.com";

    const token = await createLocalSessionToken(userId, email);
    const payload = await verifyLocalSessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(userId);
    expect(payload?.email).toBe(email);
  });

  it("returns null for an expired token", async () => {
    // Create a token that expires in 1ms
    const token = await createLocalSessionToken(1, "expired@example.com", {
      expiresInMs: 1,
    });

    // Wait for it to expire
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await verifyLocalSessionToken(token);
    expect(result).toBeNull();
  });
});
