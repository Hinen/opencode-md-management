export type TargetMode = "mirror";

export type AgentMdTarget = {
  path: string;
  mode: TargetMode;
  enabled: boolean;
};

export type AgentMdConfig = {
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
