export type TargetMode = "mirror" | "local";

export type AgentMdTarget = {
  path: string;
  mode: TargetMode;
  enabled: boolean;
};

export type AgentMdConfig = {
  scope?: string;
  canonical?: string;
  targets: AgentMdTarget[];
  scopes: AgentMdScope[];
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

export type AgentMdScope = {
  id: string;
  root: string;
  config?: string;
  canonical?: string;
};

export type ManifestTarget = {
  path: string;
  mode: TargetMode;
  lastSyncedHash: string;
};

export type AgentMdManifest = {
  version: 1;
  canonical: {
    path: string;
    hash: string;
  };
  targets: ManifestTarget[];
};

export type CanonicalFile = {
  path: string;
  content: string;
  hash: string;
};
