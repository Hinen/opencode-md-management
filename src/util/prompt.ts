import { createInterface } from "node:readline/promises";

export type PromptChoiceOption<T> = {
  label: string;
  value: T;
};

export type PromptOptions = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export function isInteractive(options: PromptOptions = {}): boolean {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  return Boolean((input as NodeJS.ReadStream).isTTY) && Boolean((output as NodeJS.WriteStream).isTTY);
}

export async function promptChoice<T>(question: string, choices: PromptChoiceOption<T>[], options: PromptOptions = {}): Promise<T> {
  if (choices.length === 0)
    throw new Error("promptChoice requires at least one choice");

  const output = options.output ?? process.stdout;
  const lines = [question];

  for (let index = 0; index < choices.length; index += 1)
    lines.push(`  ${index + 1}) ${choices[index].label}`);

  output.write(`${lines.join("\n")}\n`);

  for (;;) {
    const answer = (await readLine(`Choice [1-${choices.length}]: `, options)).trim();
    const numeric = Number.parseInt(answer, 10);

    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length)
      return choices[numeric - 1].value;

    output.write(`Please enter a number between 1 and ${choices.length}.\n`);
  }
}

export async function promptMultiSelect<T>(question: string, choices: PromptChoiceOption<T>[], options: PromptOptions = {}): Promise<T[]> {
  if (choices.length === 0)
    return [];

  const output = options.output ?? process.stdout;
  const lines = [question];

  for (let index = 0; index < choices.length; index += 1)
    lines.push(`  ${index + 1}) ${choices[index].label}`);

  lines.push("Enter comma-separated numbers (e.g. 1,3) or press Enter for none.");
  output.write(`${lines.join("\n")}\n`);

  for (;;) {
    const answer = (await readLine("Selection: ", options)).trim();

    if (answer.length === 0)
      return [];

    const tokens = answer.split(",").map((token) => token.trim()).filter(Boolean);
    const indices: number[] = [];
    let invalid = false;

    for (const token of tokens) {
      const numeric = Number.parseInt(token, 10);

      if (!Number.isInteger(numeric) || numeric < 1 || numeric > choices.length) {
        invalid = true;
        break;
      }

      indices.push(numeric - 1);
    }

    if (invalid) {
      output.write(`Each entry must be a number between 1 and ${choices.length}.\n`);
      continue;
    }

    return Array.from(new Set(indices)).map((index) => choices[index].value);
  }
}

async function readLine(prompt: string, options: PromptOptions): Promise<string> {
  const rl = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout
  });

  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}
