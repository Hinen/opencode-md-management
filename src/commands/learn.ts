import { readFile } from "node:fs/promises";
import { runRevise } from "./revise.js";
import type { LlmProvider } from "../core/llm.js";

export type LearnCommandOptions = {
  notes?: string;
  notesFile?: string;
  provider?: LlmProvider;
};

export async function runLearn(root: string, options: LearnCommandOptions): Promise<string> {
  const notes = options.notes ?? await readNotesFile(options.notesFile);

  if (notes.trim().length === 0)
    throw new Error("learn requires notes or notesFile");

  return runRevise(root, { notes, provider: options.provider, kind: "learn" });
}

async function readNotesFile(path: string | undefined): Promise<string> {
  if (!path)
    return "";

  return readFile(path, "utf8");
}
