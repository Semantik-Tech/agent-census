export const CLIENT_TARGET_IDS = [
  "cursor",
  "claude-code",
  "gemini-cli",
  "vscode",
  "copilot-cli",
  "codex",
] as const;

export type ClientTarget = (typeof CLIENT_TARGET_IDS)[number];
