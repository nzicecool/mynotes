/**
 * Client-side encryption module using Web Crypto API
 * Implements AES-256-GCM encryption with PBKDF2 key derivation
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt);
}

/**
 * Derive encryption key from password using PBKDF2
 */
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = base64ToArrayBuffer(salt);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-256-GCM
 */
export async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    dataBuffer
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Check whether a string is valid Base64
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  try {
    // Base64 strings must have length divisible by 4 (with padding)
    // and contain only valid Base64 characters
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0;
  } catch {
    return false;
  }
}

/**
 * Decrypt data using AES-256-GCM.
 * Returns null if the data is not valid encrypted content (e.g. legacy plain-text notes).
 */
export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string | null> {
  // Guard: if the content is not valid Base64, it was never encrypted
  if (!isValidBase64(encryptedData)) {
    return encryptedData; // Return as-is — it's plain text
  }

  let combined: ArrayBuffer;
  try {
    combined = base64ToArrayBuffer(encryptedData);
  } catch {
    // atob failed — treat as plain text
    return encryptedData;
  }

  // Guard: minimum size is IV (12 bytes) + 1 byte ciphertext + 16 byte GCM tag = 29 bytes
  if (combined.byteLength < IV_LENGTH + 17) {
    return encryptedData;
  }

  // Extract IV and encrypted data
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);

  try {
    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch {
    // Decryption failed — wrong key or corrupted data
    // Return a placeholder rather than crashing
    return null;
  }
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Store encryption key in memory (session storage)
 * Note: Key is cleared when user logs out or closes browser
 */
let encryptionKey: CryptoKey | null = null;

export function setEncryptionKey(key: CryptoKey) {
  encryptionKey = key;
}

export function getEncryptionKey(): CryptoKey | null {
  return encryptionKey;
}

export function clearEncryptionKey() {
  encryptionKey = null;
}

/**
 * Check if encryption key is available
 */
export function hasEncryptionKey(): boolean {
  return encryptionKey !== null;
}
