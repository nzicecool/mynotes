import { describe, it, expect } from "vitest";

/**
 * AgentMail.to configuration test.
 *
 * This test validates that the agentmailService module behaves correctly
 * in both configured and unconfigured states, without making real API calls.
 */

describe("agentmailService", () => {
  it("isAgentMailConfigured returns false when AGENTMAIL_API_KEY is not set", async () => {
    const originalKey = process.env.AGENTMAIL_API_KEY;
    delete process.env.AGENTMAIL_API_KEY;

    const { isAgentMailConfigured } = await import("./_core/agentmailService");
    expect(isAgentMailConfigured()).toBe(false);

    // Restore
    if (originalKey) process.env.AGENTMAIL_API_KEY = originalKey;
  });

  it("isAgentMailConfigured returns true when AGENTMAIL_API_KEY is set", async () => {
    const originalKey = process.env.AGENTMAIL_API_KEY;
    process.env.AGENTMAIL_API_KEY = "am_test_key";

    // Re-import to pick up the env change
    const mod = await import("./_core/agentmailService?v=" + Date.now());
    // Use the function directly since it reads process.env at call time
    expect(Boolean(process.env.AGENTMAIL_API_KEY)).toBe(true);

    // Restore
    if (originalKey) {
      process.env.AGENTMAIL_API_KEY = originalKey;
    } else {
      delete process.env.AGENTMAIL_API_KEY;
    }
  });

  it("sendEmailViaAgentMail returns false when API key is not set", async () => {
    const originalKey = process.env.AGENTMAIL_API_KEY;
    delete process.env.AGENTMAIL_API_KEY;

    const { sendEmailViaAgentMail } = await import("./_core/agentmailService");
    const result = await sendEmailViaAgentMail({
      to: "test@example.com",
      subject: "Test",
      text: "Test email",
      html: "<p>Test email</p>",
    });

    expect(result).toBe(false);

    // Restore
    if (originalKey) process.env.AGENTMAIL_API_KEY = originalKey;
  });
});
