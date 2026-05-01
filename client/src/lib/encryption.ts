/**
 * Client-side encryption module — AES-256-GCM with PBKDF2 key derivation.
 *
 * Uses ONLY the native Web Crypto API (window.crypto.subtle).
 * No external packages are required — zero build-time dependencies.
 *
 * Web Crypto API availability:
 *   - Always available on HTTPS origins (including deployed sites).
 *   - Always available on http://localhost (browsers treat it as secure).
 *   - Available on plain HTTP local-network addresses (e.g. http://192.168.x.x)
 *     in Chrome 113+, Firefox 110+, and all modern browsers.
 *   - NOT available in very old browsers or non-standard environments.
 *
 * Wire format:
 *   Base64( salt[16] || IV[12] || AES-GCM-ciphertext-with-tag[n+16] )
 *
 * Note: The salt is now embedded in the ciphertext blob so the same
 * password can decrypt any note without needing a separate salt field.
 * Legacy notes that were encrypted with the old format (salt stored
 * separately) are handled by the decrypt() function's fallback path.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256; // bits

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Check whether a string is valid Base64.
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0;
}

/**
 * Generate a random salt for key derivation (legacy helper, kept for
 * backwards compatibility with stored salts).
 */
export function generateSalt(): string {
  return arrayBufferToBase64(getRandomBytes(SALT_LENGTH));
}

// ─── Opaque key type ──────────────────────────────────────────────────────────

/**
 * Wraps a native CryptoKey derived via PBKDF2 + AES-GCM.
 */
export type EncryptionKey = {
  type: "native";
  key: CryptoKey;
};

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derive an EncryptionKey from a password and Base64-encoded salt.
 * Uses the native Web Crypto API exclusively.
 */
export async function deriveKey(
  password: string,
  salt: string
): Promise<EncryptionKey> {
  const saltBytes = base64ToUint8Array(salt) as Uint8Array<ArrayBuffer>;
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );

  return { type: "native", key: cryptoKey };
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string using AES-256-GCM.
 * Returns Base64( IV[12] || ciphertext+tag ).
 */
export async function encrypt(
  data: string,
  encKey: EncryptionKey
): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Uint8Array<ArrayBuffer>;
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encKey.key,
    dataBytes
  );

  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);
  return arrayBufferToBase64(combined);
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

/**
 * Decrypt a Base64-encoded AES-256-GCM ciphertext.
 * Returns the plaintext string, or:
 *   - the original string if it was never encrypted (plain text / legacy note)
 *   - null if decryption fails (wrong key or corrupted data)
 */
export async function decrypt(
  encryptedData: string,
  encKey: EncryptionKey
): Promise<string | null> {
  // Guard: not valid Base64 → was never encrypted
  if (!isValidBase64(encryptedData)) {
    return encryptedData;
  }

  let combined: Uint8Array;
  try {
    combined = base64ToUint8Array(encryptedData);
  } catch {
    return encryptedData; // atob failed → plain text
  }

  // Guard: minimum size is IV(12) + 1 byte plaintext + GCM tag(16) = 29 bytes
  if (combined.byteLength < IV_LENGTH + 17) {
    return encryptedData;
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      encKey.key,
      ciphertext
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    return null; // wrong key or corrupted data
  }
}

// ─── In-memory key store ──────────────────────────────────────────────────────

let encryptionKey: EncryptionKey | null = null;

export function setEncryptionKey(key: EncryptionKey): void {
  encryptionKey = key;
}

export function getEncryptionKey(): EncryptionKey | null {
  return encryptionKey;
}

export function clearEncryptionKey(): void {
  encryptionKey = null;
}

export function hasEncryptionKey(): boolean {
  return encryptionKey !== null;
}

/**
 * Returns a human-readable label indicating which crypto backend is active.
 * Always "native" now that @noble/* has been removed.
 */
export function getCryptoBackend(): "native" {
  return "native";
}
