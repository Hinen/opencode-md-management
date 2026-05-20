import { createHash } from "node:crypto";

export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

export function hashContent(content: string): string {
  const hash = createHash("sha256")
    .update(normalizeContent(content), "utf8")
    .digest("hex");

  return `sha256:${hash}`;
}
