import type { TargetOs } from "./types.js";

export function defaultTargetOs(): TargetOs {
  return process.platform === "win32" ? "windows" : "macos";
}

export function resolveTargetOs(ctx: { targetOs?: TargetOs }): TargetOs {
  return ctx.targetOs ?? defaultTargetOs();
}
