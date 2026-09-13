import { test } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeCredential,
  REDACTED,
  redactArg,
  redactArgs,
  redactHeaders,
  redactUrl,
} from "../src/redact.js";

// Fake secrets are assembled at runtime so the repo never contains strings
// that secret scanners (or push protection) would flag.
const body = (n: number) => "a1B2c3D4e5F6g7H8".repeat(4).slice(0, n);
const FAKE = {
  openai: `sk-${"proj-"}${body(40)}`,
  ghp: `ghp_${body(36)}`,
  githubPat: `github_pat_${body(22)}_${body(40)}`,
  aws: `AKIA${"IOSFODNN7EXAMPL0".toUpperCase()}`,
  slack: `xoxb-${"1234567890"}-${body(24)}`,
  jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", body(43)].join("."),
  entropy: "q8Zr2VnXk5Tw9LmB3yHc7JdP4sGf6AeR1uNo0KiW",
  hex: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
};

test("credential detector: known prefixes, JWT, AWS, hex and high-entropy tokens", () => {
  for (const [name, value] of Object.entries(FAKE)) {
    assert.equal(looksLikeCredential(value), true, `${name} should be detected`);
  }
});

test("credential detector: ordinary arguments survive", () => {
  for (const value of [
    "-y",
    "--stdio",
    "npx",
    "@modelcontextprotocol/server-filesystem",
    "next-devtools-mcp@latest",
    "/tmp/agent-census-spike",
    "C:\\Users\\Public\\agent-census-spike",
    "/Users/Jacob2/Documents/Projects/SomeRepo123/src/index.ts",
    "mcp-server-docker:latest",
    "sk-learn",
    "skeleton",
    "AKIAshort",
    "ModelContextProtocolServerFilesystem2024",
  ]) {
    assert.equal(looksLikeCredential(value), false, `${value} should survive`);
  }
});

test("args: credential-shaped arguments are redacted", () => {
  for (const value of Object.values(FAKE)) assert.equal(redactArg(value), REDACTED);
  assert.equal(redactArg(`--api-key=${FAKE.openai}`), `--api-key=${REDACTED}`);
  assert.equal(redactArg("--password=hunter2"), `--password=${REDACTED}`);
  assert.equal(redactArg("GITHUB_TOKEN=anything"), `GITHUB_TOKEN=${REDACTED}`);
  assert.equal(redactArg(`OTHER=${FAKE.ghp}`), `OTHER=${REDACTED}`);
  assert.equal(redactArg("Authorization: Bearer abc"), `Authorization: ${REDACTED}`);
  assert.equal(redactArg(`Bearer ${FAKE.jwt}`), `Bearer ${REDACTED}`);
  assert.equal(redactArg("x-custom-auth-header=Bearer short"), `x-custom-auth-header=Bearer ${REDACTED}`);
  assert.equal(
    redactArg("postgresql://admin:s3cret@db.internal:5432/app"),
    `postgresql://admin:${REDACTED}@db.internal:5432/app`,
  );
  assert.deepEqual(redactArgs(["--token", "short-but-secret", "--verbose"]), ["--token", REDACTED, "--verbose"]);
  assert.deepEqual(redactArgs(["--api-key", FAKE.openai]), ["--api-key", REDACTED]);
});

test("args: normal arguments survive untouched", () => {
  const args = [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/tmp/agent-census-spike",
    "C:\\Users\\Public\\agent-census-spike",
    "--port=8080",
    "-e",
    "GITHUB_PERSONAL_ACCESS_TOKEN",
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    "github:owner/repo",
    "https://mcp.example.com/org/acme/filesystem-spike",
    "postgresql://localhost/app",
    "--no-auth",
    "--verbose",
  ];
  assert.deepEqual(redactArgs(args), args);
});

test("headers: sensitive names and credential-shaped values are redacted", () => {
  assert.deepEqual(
    redactHeaders({
      Authorization: "Bearer ${env:TOKEN}",
      "X-Api-Key": "abc",
      "X-Goog-Api-Key": "abc",
      "X-Session-Token": "abc",
      "Client-Secret": "abc",
      Cookie: "session=abc",
      "X-Custom": FAKE.ghp,
    }),
    {
      Authorization: REDACTED,
      "X-Api-Key": REDACTED,
      "X-Goog-Api-Key": REDACTED,
      "X-Session-Token": REDACTED,
      "Client-Secret": REDACTED,
      Cookie: REDACTED,
      "X-Custom": REDACTED,
    },
  );
});

test("headers: ordinary headers survive", () => {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream", "X-Org": "acme", "X-Keyboard": "qwerty" };
  assert.deepEqual(redactHeaders(headers), headers);
});

test("urls: sensitive query parameters are redacted", () => {
  for (const name of ["token", "api_key", "apiKey", "client_secret", "password", "auth", "sig"]) {
    const out = redactUrl(`https://mcp.example.com/sse?${name}=value123&page=2`);
    assert.equal(out, `https://mcp.example.com/sse?${name}=${REDACTED}&page=2`, name);
  }
  assert.equal(
    redactUrl(`https://mcp.example.com/${FAKE.entropy}/mcp`),
    `https://mcp.example.com/${REDACTED}/mcp`,
  );
  assert.equal(redactUrl(`https://user:pw@mcp.example.com/mcp`), `https://user:${REDACTED}@mcp.example.com/mcp`);
  assert.equal(
    redactUrl("https://app.example.com/callback#access_token=abc&state=xyz"),
    `https://app.example.com/callback#access_token=${REDACTED}&state=xyz`,
  );
});

test("review regressions: secrets in awkward positions are redacted", () => {
  const hex32 = "0123456789abcdef0123456789abcdef";
  const cases: [string, string][] = [
    // URLs that `new URL()` rejects still get query/userinfo redaction.
    ["https://${env:MCP_HOST}/mcp?api_key=abc123secret", `https://\${env:MCP_HOST}/mcp?api_key=${REDACTED}`],
    ["https://example.com:99999/mcp?token=abc123", `https://example.com:99999/mcp?token=${REDACTED}`],
    // Connection strings.
    ["Server=db;User Id=sa;Password=hunter2;", `Server=db;User Id=sa;Password=${REDACTED};`],
    ["host=db password=hunter2 dbname=app", `host=db password=${REDACTED} dbname=app`],
    ["DefaultEndpointsProtocol=https;AccountKey=abc/def==;", `DefaultEndpointsProtocol=https;AccountKey=${REDACTED};`],
    // Embedded in JSON or after a prefix.
    [`{"apiKey":"not-shaped-like-a-key"}`, `{"apiKey":"${REDACTED}"}`],
    [`user:${FAKE.ghp}`, `user:${REDACTED}`],
    // Userinfo without a password.
    [`https://${FAKE.ghp}@github.com/org/repo.git`, `https://${REDACTED}@github.com/org/repo.git`],
    ["redis://hunter2@cache.internal:6379", `redis://${REDACTED}@cache.internal:6379`],
    // Vendor shapes.
    [`fc-${hex32}`, REDACTED],
    [`sbp_${hex32}abcd1234`, REDACTED],
    [`dop_v1_${hex32}${hex32}`, REDACTED],
    // Joined at runtime so secret scanners don't flag a literal webhook URL.
    [["https://hooks.slack.com/services", "T0ABCDEF1", "B0ABCDEF2", "Xy7Qp9Lm3Rt5Vw8Zk2Nb4Hc6"].join("/"), `https://hooks.slack.com/services/T0ABCDEF1/B0ABCDEF2/${REDACTED}`],
    // Env-style names and short values.
    ["DB_PASS=hunter2", `DB_PASS=${REDACTED}`],
    ["Token abc123", `Token ${REDACTED}`],
  ];
  for (const [input, expected] of cases) assert.equal(redactArg(input), expected, input);
  assert.deepEqual(redactArgs(["--api-key", "-abc123secret"]), ["--api-key", REDACTED]);
  assert.deepEqual(redactArgs(["--pat", "x"]), ["--pat", REDACTED]);
  assert.deepEqual(redactHeaders({ apikey: "x", "X-Auth": "y", api_key: "z" }), {
    apikey: REDACTED,
    "X-Auth": REDACTED,
    api_key: REDACTED,
  });
  // A malformed percent-escape must not throw.
  assert.equal(redactUrl("https://example.com/%E0%A4%A/mcp"), "https://example.com/%E0%A4%A/mcp");
});

test("review regressions: harmless look-alikes survive", () => {
  const args = [
    "--hotkey",
    "ctrl",
    "--keys-file",
    "keys.txt",
    "mcp/github@sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "/etc/secret:/data",
    "bypass=true",
  ];
  assert.deepEqual(redactArgs(args), args);
});

test("urls: ordinary URLs are returned byte-for-byte", () => {
  for (const url of [
    "https://mcp.example.com/org/acme/filesystem-spike",
    "https://mcp.posthog.com/mcp?features=flags,insights&region=us",
    "http://127.0.0.1:8765/filesystem-spike",
    "https://api.example.com/v1/mcp?page=2&format=json",
    "https://docs.example.com/guide#install",
  ]) {
    assert.equal(redactUrl(url), url);
  }
});
