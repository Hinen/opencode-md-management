export type TargetMode = "mirror";

export type ScopeKind = "project" | "local" | "global" | "nested";

export type ScopeTool = "opencode" | "claude" | "codex" | "gemini" | "copilot" | null;

export type AgentMdScopeIdentity = {
  id: string;
  kind: ScopeKind;
  tool: ScopeTool;
};

export type AgentMdTarget = {
  path: string;
  mode: TargetMode;
  enabled: boolean;
};

export type AgentMdConfig = {
  schemaVersion: 2;
  scope: AgentMdScopeIdentity;
  primary: string;
  canonical?: string;
  targets: AgentMdTarget[];
  sync: {
    requireGitClean: boolean;
    backupDir: string;
  };
  audit: {
    maxSectionLines: number;
    forbidSecretsPatterns: boolean;
  };
  llm: {
    enabled: boolean;
    promptInjectionGuard: boolean;
  };
};

export type ManifestTarget = {
  path: string;
  mode: TargetMode;
  lastSyncedHash: string;
};

export type AgentMdManifest = {
  version: 2;
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
  targets: ManifestTarget[];
  adoptedAt: string;
};

export type CanonicalFile = {
  path: string;
  content: string;
  hash: string;
};
