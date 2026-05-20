export type DiffOptions = {
  context?: number;
};

type DiffOperation = {
  type: "equal" | "delete" | "insert";
  line: string;
  oldLine?: number;
  newLine?: number;
};

type DiffHunk = {
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  operations: DiffOperation[];
};

export function renderUnifiedDiff(path: string, before: string, after: string, options: DiffOptions = {}): string {
  if (before === after)
    return "";

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const operations = diffLines(beforeLines, afterLines);
  const hunks = createHunks(operations, options.context ?? 3);

  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    ...hunks.flatMap(renderHunk)
  ].join("\n");
}

function diffLines(beforeLines: string[], afterLines: string[]): DiffOperation[] {
  const table = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0) as number[]);

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      table[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
        ? table[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(table[beforeIndex + 1][afterIndex], table[beforeIndex][afterIndex + 1]);
    }
  }

  const operations: DiffOperation[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      operations.push({
        type: "equal",
        line: beforeLines[beforeIndex],
        oldLine: beforeIndex + 1,
        newLine: afterIndex + 1
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) {
      operations.push({ type: "delete", line: beforeLines[beforeIndex], oldLine: beforeIndex + 1 });
      beforeIndex += 1;
    } else {
      operations.push({ type: "insert", line: afterLines[afterIndex], newLine: afterIndex + 1 });
      afterIndex += 1;
    }
  }

  while (beforeIndex < beforeLines.length) {
    operations.push({ type: "delete", line: beforeLines[beforeIndex], oldLine: beforeIndex + 1 });
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    operations.push({ type: "insert", line: afterLines[afterIndex], newLine: afterIndex + 1 });
    afterIndex += 1;
  }

  return operations;
}

function createHunks(operations: DiffOperation[], context: number): DiffHunk[] {
  const changedIndexes = operations
    .map((operation, index) => operation.type === "equal" ? -1 : index)
    .filter((index) => index >= 0);

  if (changedIndexes.length === 0)
    return [];

  const ranges: Array<{ start: number; end: number }> = [];

  for (const changedIndex of changedIndexes) {
    const start = Math.max(0, changedIndex - context);
    const end = Math.min(operations.length - 1, changedIndex + context);
    const last = ranges.at(-1);

    if (last && start <= last.end + 1)
      last.end = Math.max(last.end, end);
    else
      ranges.push({ start, end });
  }

  return ranges.map((range) => toHunk(operations.slice(range.start, range.end + 1)));
}

function toHunk(operations: DiffOperation[]): DiffHunk {
  const oldLines = operations.flatMap((operation) => operation.type === "insert" ? [] : [operation.oldLine ?? 1]);
  const newLines = operations.flatMap((operation) => operation.type === "delete" ? [] : [operation.newLine ?? 1]);

  return {
    oldStart: oldLines[0] ?? operations.find((operation) => operation.newLine !== undefined)?.newLine ?? 1,
    oldLength: oldLines.length,
    newStart: newLines[0] ?? operations.find((operation) => operation.oldLine !== undefined)?.oldLine ?? 1,
    newLength: newLines.length,
    operations
  };
}

function renderHunk(hunk: DiffHunk): string[] {
  return [
    `@@ -${hunk.oldStart},${hunk.oldLength} +${hunk.newStart},${hunk.newLength} @@`,
    ...hunk.operations.map(renderOperation)
  ];
}

function renderOperation(operation: DiffOperation): string {
  switch (operation.type) {
    case "equal":
      return ` ${operation.line}`;
    case "delete":
      return `-${operation.line}`;
    case "insert":
      return `+${operation.line}`;
  }
}
