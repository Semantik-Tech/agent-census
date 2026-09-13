import type { AST } from "toml-eslint-parser";
import { getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import type { McpServerFragment } from "@semantik-tech/adapters-shared";

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}

function renderServerBlock(id: string, fragment: McpServerFragment): string {
  const lines = [`[mcp_servers.${id}]`];
  if (fragment.transport === "http" || fragment.transport === "sse") {
    lines.push(`url = ${tomlString(fragment.url ?? "")}`);
    if (fragment.headers && Object.keys(fragment.headers).length > 0) {
      const pairs = Object.entries(fragment.headers)
        .map(([key, value]) => `${key} = ${tomlString(value)}`)
        .join(", ");
      lines.push(`http_headers = { ${pairs} }`);
    }
    if (typeof fragment.nativeExtras?.auth === "string") {
      lines.push(`auth = ${tomlString(fragment.nativeExtras.auth)}`);
    }
    return lines.join("\n");
  }

  lines.push(`command = ${tomlString(fragment.command ?? "")}`);
  if (fragment.args?.length) {
    lines.push(`args = ${tomlArray(fragment.args)}`);
  }
  if (fragment.env && Object.keys(fragment.env).length > 0) {
    lines.push("");
    lines.push(`[mcp_servers.${id}.env]`);
    for (const [key, value] of Object.entries(fragment.env)) {
      lines.push(`${key} = ${tomlString(value)}`);
    }
  }
  return lines.join("\n");
}

function tableKeyPath(table: AST.TOMLTable): string[] {
  return table.key.keys.map((key) => key.name);
}

function collectMcpServerRanges(ast: AST.TOMLProgram): [number, number][] {
  const ranges: [number, number][] = [];

  const visit = (nodes: AST.TOMLTableContent[]): void => {
    for (const node of nodes) {
      if (node.type !== "TOMLTable") continue;
      const path = tableKeyPath(node);
      if (path[0] === "mcp_servers") {
        ranges.push(node.range);
      }
      visit(node.body);
    }
  };

  for (const top of ast.body) {
    if (top.type === "TOMLTopLevelTable") {
      visit(top.body);
    }
  }

  return ranges;
}

function spliceRanges(
  source: string,
  removeRanges: [number, number][],
  insert: string,
): string {
  const sorted = [...removeRanges].sort((a, b) => b[0] - a[0]);
  let result = source;
  const insertAt =
    sorted.length > 0 ? sorted[sorted.length - 1]![0]! : result.length;
  for (const [start, end] of sorted) {
    result = result.slice(0, start) + result.slice(end);
  }
  if (!insert) return result.replace(/\n{3,}/g, "\n\n").trimEnd();
  const needsLeadingNewline = insertAt > 0 && result[insertAt - 1] !== "\n";
  const prefix = needsLeadingNewline ? "\n" : "";
  const patched =
    result.slice(0, insertAt) + prefix + insert + result.slice(insertAt);
  return patched.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function patchCodexConfigToml(
  existingToml: string,
  fragments: McpServerFragment[],
): string {
  let ast: AST.TOMLProgram;
  try {
    ast = parseTOML(existingToml);
  } catch (error) {
    throw new Error(
      `Malformed Codex config.toml: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    getStaticTOMLValue(ast);
  } catch (error) {
    throw new Error(
      `Malformed Codex config.toml: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const renderedServers = fragments.map((fragment) => renderServerBlock(fragment.id, fragment));
  const insert = renderedServers.join("\n\n");
  const ranges = collectMcpServerRanges(ast);
  return spliceRanges(existingToml, ranges, insert);
}

export function renderCodexMcpServersToml(fragments: McpServerFragment[]): string {
  return patchCodexConfigToml("", fragments);
}
