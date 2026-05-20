import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";
import { OpencodeMdManagement } from "../src/plugin.js";

describe("createProgram", () => {
  it("configures the CLI name", () => {
    expect(createProgram().name()).toBe("opencode-md-management");
  });

  it("registers management commands", () => {
    const commands = createProgram().commands.map((command) => command.name());

    expect(commands).toEqual(expect.arrayContaining(["init", "doctor", "audit", "sync"]));
  });

  it("registers OpenCode plugin tools", async () => {
    const hooks = await OpencodeMdManagement({} as never);

    expect(Object.keys(hooks.tool ?? {})).toEqual(expect.arrayContaining([
      "agent_md_init",
      "agent_md_doctor",
      "agent_md_audit",
      "agent_md_sync"
    ]));
  });
});
