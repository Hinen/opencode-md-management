export function renderUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after)
    return "";

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const output = [`--- a/${path}`, `+++ b/${path}`, "@@"];
  const max = Math.max(beforeLines.length, afterLines.length);

  for (let index = 0; index < max; index += 1) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];

    if (beforeLine === afterLine && beforeLine !== undefined) {
      output.push(` ${beforeLine}`);
      continue;
    }

    if (beforeLine !== undefined)
      output.push(`-${beforeLine}`);

    if (afterLine !== undefined)
      output.push(`+${afterLine}`);
  }

  return output.join("\n");
}
