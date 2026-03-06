import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const PAYLOAD_VERSION = "v1";

type ParsedPayload = {
  version: string;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
};

let cachedKey: Buffer | null = null;

function parseEncryptionKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const base64Key = Buffer.from(trimmed, "base64");
  if (base64Key.length === 32) {
    return base64Key;
  }

  throw new Error(
    "ENCRYPTION_KEY must be either a 64-character hex string or base64-encoded 32-byte key"
  );
}

function getEncryptionKey(): Buffer {
  if (!cachedKey) {
    cachedKey = parseEncryptionKey(env.ENCRYPTION_KEY);
  }

  return cachedKey;
}

function parsePayload(payload: string): ParsedPayload {
  const [version, ivB64, authTagB64, ciphertextB64] = payload.split(":");

  if (!version || !ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }

  return {
    version,
    iv: Buffer.from(ivB64, "base64"),
    authTag: Buffer.from(authTagB64, "base64"),
    ciphertext: Buffer.from(ciphertextB64, "base64"),
  };
}

export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    PAYLOAD_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const { version, iv, authTag, ciphertext } = parsePayload(payload);

  if (version !== PAYLOAD_VERSION) {
    throw new Error(`Unsupported encrypted payload version: ${version}`);
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return value.startsWith(`${PAYLOAD_VERSION}:`) && value.split(":").length === 4;
}
