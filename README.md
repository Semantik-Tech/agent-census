# agent-census

See what the AI coding agents on your machine are configured with. It lists
every **MCP server** and **skill pack** across Cursor, Claude Code, Gemini CLI,
VS Code, Copilot CLI and Codex, in one command.

```sh
npx agent-census
```

```text
Cursor
  config: ~/.cursor/mcp.json
  MCP servers (2)
    github  stdio  docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN mcp/github
      env: GITHUB_PERSONAL_ACCESS_TOKEN
    stitch  http  https://stitch.googleapis.com/mcp
      headers: X-Goog-Api-Key: [redacted]
  Skill packs (1)
    pdf-tools  ~/.cursor/skills/pdf-tools

Not detected: Copilot CLI, Codex

2 MCP servers across 1 tool, 1 skill pack.
```

## What it promises

- **Read-only.** It reads config files and lists directories. It never writes,
  moves or deletes anything.
- **Offline.** No network access of any kind: no telemetry, no update checks. The
  bundle imports only `node:fs`, `node:os`, `node:path`, `node:url` and
  `node:util`, and a test enforces that.
- **No account, no key, no config file.**
- **Secrets stay out of the output.** See [Redaction](#redaction).
- Exits `0` whether or not anything is found. Exits `2` on a bad flag, `1` only
  on an unexpected crash.

Requires Node.js 20 or later.

## Options

| Flag | |
| --- | --- |
| `--json` | Print the machine-readable report described below |
| `--home <path>` | Scan this directory as if it were your home directory |
| `--target <id>` | Scan one client: `cursor`, `claude-code`, `gemini-cli`, `vscode`, `copilot-cli`, `codex` |
| `--version` | Print the version |
| `--help` | Print usage |

Warnings, such as a config file that is not valid JSON, go to stderr. The file
is skipped and every other client is still reported.

## What is scanned

Paths are relative to your home directory (`%USERPROFILE%` on Windows).

| Client | MCP config | Skill packs |
| --- | --- | --- |
| Cursor | `.cursor/mcp.json` | `.cursor/skills/*/SKILL.md` |
| Claude Code | `.claude.json` (user-scope `mcpServers`) | `.claude/skills/*/SKILL.md` |
| Gemini CLI | `.gemini/settings.json`, plus `.gemini/config/mcp_config.json` | `.gemini/skills/*/SKILL.md` |
| VS Code | macOS `Library/Application Support/Code/User/mcp.json`<br>Windows `%APPDATA%\Code\User\mcp.json`<br>Linux `.config/Code/User/mcp.json` | `.copilot/skills/*/SKILL.md` |
| Copilot CLI | `.copilot/mcp-config.json` | `.copilot/skills/*/SKILL.md` |
| Codex | `.codex/config.toml` | `.agents/skills/*/SKILL.md` |

VS Code and Copilot CLI share `~/.copilot/skills`, so their packs appear under
both clients. The total counts each directory once. JSON files may contain
comments and trailing commas.

## JSON output

`--json` prints one object. Fields are only ever added within a
`schemaVersion`; any breaking change increments it.

```jsonc
{
  "schemaVersion": 1,
  "platform": "macos",               // "macos" | "windows" | "linux"
  "clientTargets": [                 // always in this order; filtered by --target
    {
      "clientTarget": "cursor",
      "present": true,               // config file exists, or a skill pack is installed
      "configPath": "/Users/me/.cursor/mcp.json",
      "configFound": true,
      "mcpServers": [
        {
          "id": "github",
          "transport": "stdio",      // "stdio" | "http" | "sse"
          "command": "docker",       // stdio only
          "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "mcp/github"],
          "argsCount": 6,
          "envKeys": ["GITHUB_PERSONAL_ACCESS_TOKEN"],   // names only, never values
          "configPath": "/Users/me/.cursor/mcp.json"     // file this server came from
        },
        {
          "id": "stitch",
          "transport": "http",
          "url": "https://stitch.googleapis.com/mcp",    // http/sse only
          "argsCount": 0,
          "envKeys": [],
          "headers": { "X-Goog-Api-Key": "[redacted]" },
          "configPath": "/Users/me/.cursor/mcp.json"
        }
      ],
      "skillPacks": [{ "slug": "pdf-tools", "path": "/Users/me/.cursor/skills/pdf-tools" }],
      "warnings": []
    }
  ],
  "totals": { "mcpServers": 2, "clientTargets": 1, "skillPacks": 1 }
}
```

Human output abbreviates your home directory to `~`. JSON output uses absolute
paths.

## Redaction

Anything that could be a secret is replaced with `[redacted]` in both output
modes:

- **Environment variables.** Only key names are reported. Values are never
  printed.
- **Headers.** Values of `Authorization`, `Proxy-Authorization`, `Cookie`,
  and any header whose name ends in a word like `key`, `token`, `secret`,
  `password` or `auth` (`X-Api-Key`, `apikey`, `X-Auth`). Also any header value
  that looks like a credential or follows `Bearer`/`Basic`.
- **URLs.** Query parameters whose name contains `token`, `key`, `secret`,
  `password`, `auth` or `sig`, the password in `scheme://user:password@host`
  (so database connection strings are covered), and path segments that look
  like credentials.
- **Command arguments.** JWTs, long high-entropy strings, long hex strings and
  known key prefixes (`sk-`, `ghp_`, `github_pat_`, `AKIA`, `xoxb-` and
  others), including inside JSON or connection strings. Also sensitive
  `name=value` pairs (`--api-key=…`, `API_TOKEN=…`, `Password=…;`) and the
  argument after a flag such as `--token` or `--password`.

Known limits: bare UUIDs are treated as identifiers, not keys. 40-character git
commit hashes are redacted. `sha256:` digests are kept visible.

Detection is heuristic and biased towards redacting: a harmless value may be
hidden, but a secret should never be shown. If you find a secret that gets
through, please open an issue describing its shape, not its value.

## What is in this repository

| Package | Purpose |
| --- | --- |
| `packages/agent-census` | The CLI published to npm as [`agent-census`](https://www.npmjs.com/package/agent-census) |
| `packages/adapters-*` | One reader per client target: where it keeps its config, and how to parse it |
| `packages/adapters-shared` | Config paths per operating system, and the shared types |
| `packages/manifest-schema` | The client target ids and MCP server shape the adapters share |

Everything here is MIT licensed. The scanner is deliberately auditable: it makes
no network calls, writes nothing, and needs no account — read `src/scan.ts` and
`src/redact.ts` and you have seen all of it.

The adapter packages are not published to npm yet; the CLI bundles them into a
single file at build time, so `npx agent-census` has no runtime dependencies.

## Development

```sh
npm install
npm test                                   # runs on Linux, macOS and Windows in CI
npm run build                              # → packages/agent-census/dist/cli.js
node packages/agent-census/dist/cli.js     # scan this machine
```

Tests build fake home directories from `fixtures/config-samples/`, so they never
touch your real configuration.

## Related

`agent-census` reports what is installed on one machine. [Semantik](https://semantik.tech)
is the control plane for deciding what should be: distributing an approved set of
MCP servers and skills across a company's laptops, and showing where reality has
drifted from it.

## Licence

MIT. The bundled third-party dependencies and their licences are listed in
`dist/THIRD-PARTY-NOTICES.txt`.
