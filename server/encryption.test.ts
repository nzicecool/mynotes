/**
 * Tests for the Web Crypto API encryption module.
 *
 * These tests run in Node.js (which has crypto.subtle available via
 * globalThis.crypto) and exercise the encrypt/decrypt/deriveKey helpers
 * from client/src/lib/encryption.ts directly.
 */

import { describe, expect, it } from "vitest";
import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  isValidBase64,
  getCryptoBackend,
} from "../client/src/lib/encryption";

describe("Web Crypto encryption (AES-256-GCM + PBKDF2)", () => {
  it("getCryptoBackend returns native", () => {
    expect(getCryptoBackend()).toBe("native");
  });

  it("generateSalt produces a valid Base64 string of 16 bytes", () => {
    const salt = generateSalt();
    expect(isValidBase64(salt)).toBe(true);
    // 16 bytes → 24 Base64 chars (with padding)
    expect(atob(salt).length).toBe(16);
  });

  it("derives a key from password and salt", async () => {
    const salt = generateSalt();
    const key = await deriveKey("my-secure-password", salt);
    expect(key.type).toBe("native");
    expect(key.key).toBeInstanceOf(CryptoKey);
  });

  it("encrypts and decrypts a short string correctly", async () => {
    const salt = generateSalt();
    const key = await deriveKey("test-password", salt);
    const plaintext = "Hello, MyNotes!";
    const encrypted = await encrypt(plaintext, key);
    expect(isValidBase64(encrypted)).toBe(true);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts a long note correctly", async () => {
    const salt = generateSalt();
    const key = await deriveKey("long-note-password", salt);
    const longText = "Lorem ipsum ".repeat(500);
    const encrypted = await encrypt(longText, key);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(longText);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const salt = generateSalt();
    const key = await deriveKey("same-password", salt);
    const plaintext = "Same content";
    const enc1 = await encrypt(plaintext, key);
    const enc2 = await encrypt(plaintext, key);
    expect(enc1).not.toBe(enc2); // Different IVs → different ciphertext
  });

  it("fails to decrypt with a wrong key (returns null)", async () => {
    const salt = generateSalt();
    const correctKey = await deriveKey("correct-password", salt);
    const wrongKey = await deriveKey("wrong-password", salt);
    const encrypted = await encrypt("Secret note", correctKey);
    const result = await decrypt(encrypted, wrongKey);
    expect(result).toBeNull();
  });

  it("different passwords produce different keys", async () => {
    const salt = generateSalt();
    const key1 = await deriveKey("password-one", salt);
    const key2 = await deriveKey("password-two", salt);
    // Encrypt same plaintext with each key — ciphertext must differ
    const enc1 = await encrypt("test", key1);
    const enc2 = await encrypt("test", key2);
    // They will differ because the keys are different (even with same IV odds)
    // More reliably: wrong key cannot decrypt
    expect(await decrypt(enc1, key2)).toBeNull();
  });

  it("same password + different salts produce different keys", async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = await deriveKey("same-password", salt1);
    const key2 = await deriveKey("same-password", salt2);
    // Encrypt with key1, try to decrypt with key2 — must fail
    const encrypted = await encrypt("test content", key1);
    expect(await decrypt(encrypted, key2)).toBeNull();
  });

  it("returns original string for non-Base64 input (plain text / legacy note)", async () => {
    const salt = generateSalt();
    const key = await deriveKey("password", salt);
    const plainText = "This is a plain text note, not encrypted!";
    const result = await decrypt(plainText, key);
    expect(result).toBe(plainText);
  });

  it("isValidBase64 correctly identifies Base64 strings", () => {
    expect(isValidBase64(btoa("hello"))).toBe(true);
    expect(isValidBase64("not base64!!!")).toBe(false);
    expect(isValidBase64("")).toBe(false);
  });
});
