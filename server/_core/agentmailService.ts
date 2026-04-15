/**
 * AgentMail.to email service for MyNotes.
 *
 * Uses the AgentMail REST API to send transactional emails (e.g. password reset).
 * Falls back gracefully when AGENTMAIL_API_KEY is not set.
 *
 * Docs: https://docs.agentmail.to
 */

const AGENTMAIL_BASE_URL = "https://api.agentmail.to/v0";

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
}

interface AgentMailInbox {
  id: string;
  email: string;
}

/**
 * Creates or retrieves a dedicated transactional inbox for MyNotes.
 * The inbox id is cached in memory for the lifetime of the process.
 */
let _cachedInboxId: string | null = null;

async function getOrCreateInbox(apiKey: string): Promise<AgentMailInbox> {
  if (_cachedInboxId) {
    return { id: _cachedInboxId, email: "" };
  }

  // If AGENTMAIL_INBOX_ID is set, use it directly (recommended for production)
  if (process.env.AGENTMAIL_INBOX_ID) {
    _cachedInboxId = process.env.AGENTMAIL_INBOX_ID;
    return { id: _cachedInboxId, email: "" };
  }

  // Otherwise create a new inbox with a deterministic username
  const username = process.env.AGENTMAIL_INBOX_USERNAME ?? "mynotes-noreply";
  const response = await fetch(`${AGENTMAIL_BASE_URL}/inboxes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[AgentMail] Failed to create inbox: ${response.status} ${body}`);
  }

  const inbox = (await response.json()) as AgentMailInbox;
  _cachedInboxId = inbox.id;
  console.log(`[AgentMail] Using inbox: ${inbox.email} (id: ${inbox.id})`);
  return inbox;
}

/**
 * Sends a transactional email via AgentMail.to.
 *
 * Returns true on success, false on failure (never throws — callers
 * should always log the reset link as a fallback).
 */
export async function sendEmailViaAgentMail(options: SendEmailOptions): Promise<boolean> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    return false; // AgentMail not configured
  }

  try {
    const inbox = await getOrCreateInbox(apiKey);

    const response = await fetch(`${AGENTMAIL_BASE_URL}/inboxes/${inbox.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: [{ email: options.to, name: options.toName ?? options.to }],
        subject: options.subject,
        text: options.text,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[AgentMail] Failed to send email: ${response.status} ${body}`);
      return false;
    }

    console.log(`[AgentMail] Email sent to ${options.to} — subject: "${options.subject}"`);
    return true;
  } catch (err) {
    console.error("[AgentMail] Unexpected error sending email:", err);
    return false;
  }
}

/**
 * Returns true if AgentMail is configured (AGENTMAIL_API_KEY is set).
 */
export function isAgentMailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY);
}
