/**
 * Tests for the @noble/ciphers + @noble/hashes encryption fallback path.
 *
 * These tests run in Node.js (which has crypto.subtle available), so we
 * test the noble path by calling the noble primitives directly — exactly
 * as encryption.ts does when crypto.subtle is absent.
 */

import { describe, expect, it } from "vitest";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
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

function deriveNobleKey(password: string, saltBase64: string): Uint8Array {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = base64ToUint8Array(saltBase64);
  return pbkdf2(sha256, passwordBytes, saltBytes, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
}

function nobleEncrypt(data: string, key: Uint8Array): string {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const iv = randomBytes(IV_LENGTH);
  const cipher = gcm(key, iv);
  const ciphertext = cipher.encrypt(dataBytes);
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return arrayBufferToBase64(combined);
}

function nobleDecrypt(encryptedData: string, key: Uint8Array): string {
  const combined = base64ToUint8Array(encryptedData);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const cipher = gcm(key, iv);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

describe("Noble crypto fallback (AES-256-GCM + PBKDF2)", () => {
  it("derives a 32-byte key from password and salt", () => {
    const salt = arrayBufferToBase64(randomBytes(16));
    const key = deriveNobleKey("my-secure-password", salt);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.byteLength).toBe(32);
  });

  it("encrypts and decrypts a short string correctly", () => {
    const salt = arrayBufferToBase64(randomBytes(16));
    const key = deriveNobleKey("test-password", salt);
    const plaintext = "Hello, MyNotes!";
    const encrypted = nobleEncrypt(plaintext, key);
    const decrypted = nobleDecrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts a long note correctly", () => {
    const salt = arrayBufferToBase64(randomBytes(16));
    const key = deriveNobleKey("long-note-password", salt);
    const longText = "Lorem ipsum ".repeat(500);
    const encrypted = nobleEncrypt(longText, key);
    const decrypted = nobleDecrypt(encrypted, key);
    expect(decrypted).toBe(longText);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const salt = arrayBufferToBase64(randomBytes(16));
    const key = deriveNobleKey("same-password", salt);
    const plaintext = "Same content";
    const enc1 = nobleEncrypt(plaintext, key);
    const enc2 = nobleEncrypt(plaintext, key);
    expect(enc1).not.toBe(enc2); // Different IVs → different ciphertext
  });

  it("fails to decrypt with a wrong key", () => {
    const salt = arrayBufferToBase64(randomBytes(16));
    const correctKey = deriveNobleKey("correct-password", salt);
    const wrongKey = deriveNobleKey("wrong-password", salt);
    const encrypted = nobleEncrypt("Secret note", correctKey);
    expect(() => nobleDecrypt(encrypted, wrongKey)).toThrow();
  });

  it("different passwords produce different keys from the same salt", () => {
    const salt = arrayBufferToBase64(randomBytes(16));
    const key1 = deriveNobleKey("password-one", salt);
    const key2 = deriveNobleKey("password-two", salt);
    expect(arrayBufferToBase64(key1)).not.toBe(arrayBufferToBase64(key2));
  });

  it("same password + different salts produce different keys", () => {
    const salt1 = arrayBufferToBase64(randomBytes(16));
    const salt2 = arrayBufferToBase64(randomBytes(16));
    const key1 = deriveNobleKey("same-password", salt1);
    const key2 = deriveNobleKey("same-password", salt2);
    expect(arrayBufferToBase64(key1)).not.toBe(arrayBufferToBase64(key2));
  });
});
