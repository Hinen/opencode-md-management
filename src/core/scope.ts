import type { AgentMdConfig } from "./types.js";
import { discoverScopes, type ScopeContext, type ScopeSelection } from "./scope-context.js";

export type { ScopeContext, ScopeSelection };

export type InstructionScope = {
  id: string;
  root: string;
  canonical: string;
  kind: "project" | "local" | "global" | "nested";
};

export async function discoverInstructionScopes(root: string, _config: AgentMdConfig, selection: ScopeSelection = undefined): Promise<InstructionScope[]> {
  const scopes = await discoverScopes(root, selection);

  return scopes.map((scope) => ({
    id: legacyScopeId(scope),
    root: scope.root,
    canonical: scope.primary,
    kind: scope.kind
  }));
}

export function configForScope(config: AgentMdConfig, scope: InstructionScope): AgentMdConfig {
  if (scope.id === config.scope.id || scope.kind === "project")
    return config;

  return {
    ...config,
    scope: { id: scope.id, kind: scope.kind, tool: scope.kind === "global" ? "claude" : null },
    primary: scope.canonical,
    canonical: scope.canonical,
    aliases: []
  };
}

function legacyScopeId(scope: ScopeContext): string {
  if (scope.id.startsWith("nested:"))
    return scope.id.slice("nested:".length);

  if (scope.id === "global:claude")
    return "global";

  return scope.id;
}
