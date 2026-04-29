/**
 * Client-side encryption module — AES-256-GCM with PBKDF2 key derivation.
 *
 * Strategy:
 *  1. Use the native Web Crypto API (window.crypto.subtle) when available.
 *     This is the case on HTTPS and http://localhost.
 *  2. Fall back to @noble/ciphers + @noble/hashes (pure-JS implementations)
 *     when crypto.subtle is unavailable — which happens when the app is
 *     accessed over plain HTTP on a local network (e.g. http://192.168.x.x).
 *
 * Both paths produce the same wire format:
 *   Base64( IV[12] || AES-GCM-ciphertext-with-tag[n+16] )
 * so notes encrypted with one path can be decrypted with the other.
 */

import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32; // 256 bits

// ─── Secure-context detection ─────────────────────────────────────────────────

/**
 * Returns true when the native Web Crypto API is available.
 * crypto.subtle is undefined on plain HTTP (non-localhost) origins.
 */
function hasNativeCrypto(): boolean {
  return (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
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
 * Generate a random salt for key derivation.
 * Uses @noble/hashes/utils.randomBytes which works on any context.
 */
export function generateSalt(): string {
  return arrayBufferToBase64(randomBytes(SALT_LENGTH));
}

// ─── Opaque key type ──────────────────────────────────────────────────────────

/**
 * Unified key type that wraps either a native CryptoKey (HTTPS) or a raw
 * 32-byte Uint8Array (noble fallback on plain HTTP).
 */
export type EncryptionKey =
  | { type: "native"; key: CryptoKey }
  | { type: "noble"; key: Uint8Array };

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derive an EncryptionKey from a password and Base64-encoded salt.
 * Automatically selects the native or noble path based on context.
 */
export async function deriveKey(
  password: string,
  salt: string
): Promise<EncryptionKey> {
  const saltBytes = base64ToUint8Array(salt);
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  if (hasNativeCrypto()) {
    // ── Native Web Crypto path (HTTPS / localhost) ──────────────────────────
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
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return { type: "native", key: cryptoKey };
  } else {
    // ── Noble fallback path (plain HTTP / local network) ────────────────────
    const rawKey = pbkdf2(sha256, passwordBytes, saltBytes, {
      c: PBKDF2_ITERATIONS,
      dkLen: KEY_LENGTH,
    });
    return { type: "noble", key: rawKey };
  }
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

  if (encKey.type === "native") {
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
  } else {
    // Noble path — gcm() from @noble/ciphers produces ciphertext+tag
    const iv = randomBytes(IV_LENGTH);
    const cipher = gcm(encKey.key, iv);
    const ciphertext = cipher.encrypt(dataBytes); // includes 16-byte GCM tag
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);
    return arrayBufferToBase64(combined);
  }
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

  let combined: Uint8Array<ArrayBuffer>;
  try {
    combined = base64ToUint8Array(encryptedData);
  } catch {
    return encryptedData; // atob failed → plain text
  }

  // Guard: minimum size is IV(12) + 1 byte plaintext + GCM tag(16) = 29 bytes
  if (combined.byteLength < IV_LENGTH + 17) {
    return encryptedData;
  }

  const iv = combined.slice(0, IV_LENGTH) as Uint8Array<ArrayBuffer>;
  const ciphertext = combined.slice(IV_LENGTH) as Uint8Array<ArrayBuffer>;

  try {
    if (encKey.type === "native") {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        encKey.key,
        ciphertext
      );
      return new TextDecoder().decode(decryptedBuffer);
    } else {
      // Noble path
      const cipher = gcm(encKey.key, iv);
      const plaintext = cipher.decrypt(ciphertext);
      return new TextDecoder().decode(plaintext);
    }
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
 * Useful for diagnostics / about pages.
 */
export function getCryptoBackend(): "native" | "noble" {
  return hasNativeCrypto() ? "native" : "noble";
}
