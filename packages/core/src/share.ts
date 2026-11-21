import type { Blueprint } from "./blueprint";

/**
 * Share codes let people remix each other's servers. The short code
 * (RT-XXXX-XXXX) identifies a published Blueprint; the long form embeds the
 * whole Blueprint so it works offline and in a Discord message.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Stable fingerprint: the same Blueprint always gets the same code. */
export function shortCode(bp: Blueprint): string {
  const text = canonical(bp);
  let a = fnv1a(text);
  let b = fnv1a(text + "~riptide");
  let out = "";
  for (let i = 0; i < 8; i++) {
    const src = i < 4 ? a : b;
    out += ALPHABET[src & 31];
    if (i < 4) a >>>= 5;
    else b >>>= 5;
  }
  return `RT-${out.slice(0, 4)}-${out.slice(4)}`;
}

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};

export function encodeBlueprint(bp: Blueprint): string {
  const json = canonical(bp);
  const body = toB64Url(new TextEncoder().encode(json));
  const check = (fnv1a(json) & 0xffff).toString(36);
  return `riptide:1:${check}:${body}`;
}

export function decodeBlueprint(code: string): unknown {
  const [scheme, version, check, body] = code.trim().split(":");
  if (scheme !== "riptide" || version !== "1" || !body) throw new Error("That isn't a Riptide share code.");
  const json = new TextDecoder().decode(fromB64Url(body));
  if ((fnv1a(json) & 0xffff).toString(36) !== check) throw new Error("This share code is incomplete. Copy the whole code and try again.");
  return JSON.parse(json);
}
