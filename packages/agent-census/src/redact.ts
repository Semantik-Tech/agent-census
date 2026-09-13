/**
 * Credential redaction for anything that reaches stdout. Reused by the
 * public-repo research, so it has no dependency on the scanner.
 *
 * Bias: a false positive hides a harmless value; a false negative leaks a
 * secret. When in doubt, redact.
 */

export const REDACTED = "[redacted]";

const KNOWN_PREFIXES = [
  "sk-",
  "sk_live_",
  "sk_test_",
  "rk_live_",
  "ghp_",
  "gho_",
  "ghu_",
  "ghs_",
  "ghr_",
  "github_pat_",
  "glpat-",
  "xoxb-",
  "xoxp-",
  "xoxa-",
  "xapp-",
  "npm_",
  "napi_",
  "sbp_",
  "dop_v1_",
  "ya29.",
  "AIza",
  "BSA",
];
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A known prefix anywhere in a string, e.g. inside JSON or after `user:`. */
const PREFIX_ANYWHERE = new RegExp(
  `(?<![A-Za-z0-9])(?:${KNOWN_PREFIXES.map(escapeRegex).join("|")})[A-Za-z0-9_\\-.]{10,}`,
  "g",
);

const JWT = /^eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*$/;
const AWS_ACCESS_KEY = /^(AKIA|ASIA)[A-Z0-9]{16}$/;
const HEX_SECRET = /^[a-fA-F0-9]{32,}$/;
/** `fc-<hex>`, `key-<hex>`, `dop_v1_<hex>`: short vendor tag + long hex. */
const TAGGED_HEX = /^[A-Za-z][A-Za-z0-9]{0,10}(?:[_-][A-Za-z0-9]{1,6})?[_-][A-Fa-f0-9]{32,}$/;
const TOKEN_CHARS = /^[A-Za-z0-9+/=_-]+$/;

const SENSITIVE_WORD =
  /(^|[_.-])(token|key|apikey|secret|password|passwd|passphrase|pwd|pass|pat|auth|bearer|credentials?|sig|signature|accountkey|sharedaccesskey)s?$/;
/** Header names that carry credentials without saying so. */
const SENSITIVE_HEADER = /^(proxy-)?authorization$|^(set-)?cookie$/i;
/** Query-parameter names, per spec: substring match. */
const SENSITIVE_QUERY = /token|key|secret|password|auth|sig/i;

/**
 * `--api-key`, `apiKey`, `DB_PASS`, `X-Auth` → true; `hotkey`, `monkey`,
 * `--keys-file` → false. Separators and camelCase both mark word boundaries.
 */
export function isSensitiveName(name: string): boolean {
  const normalized = name
    .replace(/^-+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
  return SENSITIVE_WORD.test(normalized);
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * True when a single token looks like a credential. `minLength` is lowered
 * for URL path segments, where webhook secrets are shorter.
 */
export function looksLikeCredential(token: string, minLength = 32): boolean {
  const value = token.replace(/^["']|["']$/g, "");
  if (KNOWN_PREFIXES.some((p) => value.startsWith(p) && value.length >= p.length + 10)) return true;
  if (AWS_ACCESS_KEY.test(value) || JWT.test(value) || HEX_SECRET.test(value) || TAGGED_HEX.test(value)) {
    return true;
  }
  if (value.length < minLength || !TOKEN_CHARS.test(value)) return false;
  // ponytail: heuristic with known ceilings — filesystem paths are skipped by
  // their leading `/`, `~` or `.` (so ~1 in 64 base64 secrets that start with
  // `/` is missed), bare UUIDs are treated as ids, and 40-char git SHAs are
  // redacted. Upgrade path: per-provider patterns (gitleaks rules).
  if (/^[/~.]/.test(value)) return false;
  const mixed = /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
  if (!mixed || shannonEntropy(value) < (minLength >= 32 ? 4 : 3.5)) return false;
  // CamelCase identifiers are mostly word-like runs; random tokens are not.
  const wordy = (value.match(/[A-Z]?[a-z]{4,}/g) ?? []).join("").length;
  return wordy < value.length / 2;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Redact credential-bearing parts of a URL: userinfo, sensitive query or
 * fragment parameters, and path segments that look like credentials. Works
 * for any scheme (`https://`, `postgres://`, `redis://`, …) and falls back to
 * pattern matching when the URL does not parse (`https://${env:HOST}/…`).
 */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return redactUnparsedUrl(raw);
  }
  // Only rewrite what we must, so an unchanged URL is returned byte-for-byte.
  let changed = false;
  if (url.password) {
    url.password = "REDACTED";
    changed = true;
  } else if (url.username && (!/^https?:$/.test(url.protocol) || looksLikeCredential(safeDecode(url.username), 20))) {
    // `redis://secret@host`: a lone userinfo on a non-web scheme is the password.
    url.username = "REDACTED";
    changed = true;
  }
  const redactParams = (params: URLSearchParams): boolean => {
    let hit = false;
    for (const [key, value] of [...params]) {
      if (SENSITIVE_QUERY.test(key) || looksLikeCredential(value, 20)) {
        params.set(key, "REDACTED");
        hit = true;
      }
    }
    return hit;
  };
  if (redactParams(url.searchParams)) changed = true;
  // OAuth implicit-flow style fragments: #access_token=…
  if (url.hash.includes("=")) {
    const params = new URLSearchParams(url.hash.slice(1));
    if (redactParams(params)) {
      url.hash = params.toString();
      changed = true;
    }
  }
  const segments = url.pathname.split("/");
  if (segments.some((s) => looksLikeCredential(safeDecode(s), 20))) {
    url.pathname = segments.map((s) => (looksLikeCredential(safeDecode(s), 20) ? "REDACTED" : s)).join("/");
    changed = true;
  }
  return changed ? url.toString().replace(/REDACTED/g, REDACTED) : raw;
}

function redactUnparsedUrl(raw: string): string {
  return redactTokens(
    raw
      .replace(/(:\/\/[^/@\s]*?):[^@/\s]*@/, `$1:${REDACTED}@`)
      .replace(/([?&#;])([^=&#;\s]*)=([^&#;\s]*)/g, (match, sep: string, key: string) =>
        SENSITIVE_QUERY.test(key) ? `${sep}${key}=${REDACTED}` : match,
      ),
  );
}

const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;
const AUTH_SCHEME = /\b(Bearer|Basic|Token|ApiKey)(\s+)(?!\[redacted\])\S+/gi;
/** `Password=x;`, `"apiKey": "x"`, `host=h password=x`, `--token=x`. */
const PAIR = /(?<![\w/.-])(["']?)(-{0,2}[A-Za-z_][\w.-]*)\1(\s*[=:]\s*)(["']?)([^;&\s"',}]+)/g;

/** Replace credential-looking substrings, split on common delimiters. */
function redactTokens(text: string): string {
  return text
    .replace(PREFIX_ANYWHERE, REDACTED)
    .replace(/[^\s"'`,;{}()<>=:@]+/g, (token, offset: number, whole: string) =>
      // Keep content digests (`image@sha256:…`) visible; they identify, not authenticate.
      !/sha(1|256|384|512)[:-]$/i.test(whole.slice(Math.max(0, offset - 7), offset)) && looksLikeCredential(token)
        ? REDACTED
        : token,
    );
}

/** Redact secrets inside free text: URLs, auth schemes, `name=value` pairs, tokens. */
function redactText(text: string): string {
  return redactTokens(
    text
      .replace(URL_IN_TEXT, (url) => redactUrl(url))
      .replace(AUTH_SCHEME, `$1$2${REDACTED}`)
      .replace(PAIR, (match, q1: string, name: string, sep: string, q2: string, value: string) =>
        isSensitiveName(name) && value !== REDACTED && !value.startsWith("//")
          ? `${q1}${name}${q1}${sep}${q2}${REDACTED}`
          : match,
      ),
  );
}

/**
 * Redact one command-line argument: bare credentials, URLs and connection
 * strings, `--flag=value`, `NAME=value`, `Header: value`, JSON snippets.
 */
export function redactArg(arg: string): string {
  // `--header "Authorization: Bearer …"`.
  const header = /^([A-Za-z][\w-]*)(:\s*)(.+)$/s.exec(arg);
  if (header && (SENSITIVE_HEADER.test(header[1]) || isSensitiveName(header[1])) && !header[3].startsWith("//")) {
    return `${header[1]}${header[2]}${REDACTED}`;
  }
  return redactText(arg);
}

/**
 * Redact an argument list. Besides per-argument rules, the value following a
 * sensitive flag (`--api-key xyz`, `--password hunter2`) is always redacted.
 */
export function redactArgs(args: readonly string[]): string[] {
  return args.map((arg, i) => {
    const prev = args[i - 1];
    const prevIsSensitiveFlag = prev !== undefined && /^--?[A-Za-z][\w-]*$/.test(prev) && isSensitiveName(prev);
    const isFlag = arg.startsWith("--") || /^-[A-Za-z]$/.test(arg);
    return prevIsSensitiveFlag && !isFlag ? REDACTED : redactArg(arg);
  });
}

export function redactHeaderValue(name: string, value: string): string {
  return SENSITIVE_HEADER.test(name) || isSensitiveName(name) ? REDACTED : redactText(value);
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, redactHeaderValue(name, String(value))]),
  );
}
