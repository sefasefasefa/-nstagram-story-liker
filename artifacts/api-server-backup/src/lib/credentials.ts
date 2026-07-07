/**
 * Encrypted credential storage.
 * Saves Instagram username+password to disk so the server can auto-login
 * on startup and refresh expired sessions automatically.
 * Password is AES-256-GCM encrypted using SESSION_SECRET.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const CREDS_FILE = join(process.cwd(), ".credentials.json");

function getSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET is required but not set. Add it in Replit Secrets.");
  return s;
}

interface StoredCredentials {
  username: string;
  iv: string;       // hex
  tag: string;      // hex  
  enc: string;      // hex — encrypted password
}

export interface Credentials {
  username: string;
  password: string;
}

function deriveKey(): Buffer {
  return scryptSync(getSecret(), "ig-cred-salt-v1", 32) as Buffer;
}

export function saveCredentials(username: string, password: string): void {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const stored: StoredCredentials = {
    username,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    enc: enc.toString("hex"),
  };
  writeFileSync(CREDS_FILE, JSON.stringify(stored), "utf8");
}

export function loadCredentials(): Credentials | null {
  if (!existsSync(CREDS_FILE)) return null;
  try {
    const stored = JSON.parse(readFileSync(CREDS_FILE, "utf8")) as StoredCredentials;
    const key = deriveKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(stored.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(stored.tag, "hex"));
    const password = Buffer.concat([
      decipher.update(Buffer.from(stored.enc, "hex")),
      decipher.final(),
    ]).toString("utf8");
    return { username: stored.username, password };
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  if (existsSync(CREDS_FILE)) unlinkSync(CREDS_FILE);
}

export function hasCredentials(): boolean {
  return existsSync(CREDS_FILE);
}
