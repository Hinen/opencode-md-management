export type ScopeKind = "project" | "local" | "global" | "nested";

export type ScopeTool = "opencode" | "claude" | "codex" | "gemini" | "copilot" | null;

export type AgentMdScopeIdentity = {
  id: string;
  kind: ScopeKind;
  tool: ScopeTool;
};

export type AgentMdConfig = {
  schemaVersion: 3;
  scope: AgentMdScopeIdentity;
  primary: string;
  canonical?: string;
  aliases: string[];
  sync: {
    requireGitClean: boolean;
  };
  audit: {
    maxSectionLines: number;
    forbidSecretsPatterns: boolean;
    duplicateContentMinWords: number;
    checkLocalLinks: boolean;
  };
  llm: {
    enabled: boolean;
    promptInjectionGuard: boolean;
  };
};

export type AgentMdManifest = {
  version: 3;
  scope: AgentMdScopeIdentity;
  root: string;
  configPath: string;
  configHash: string;
  primary: {
    path: string;
    hash: string;
  };
  canonical?: {
    path: string;
    hash: string;
  };
  aliases: string[];
  adoptedAt: string;
};

export type CanonicalFile = {
  path: string;
  content: string;
  hash: string;
};
