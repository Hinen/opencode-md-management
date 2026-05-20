import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";
import { OpencodeMdManagement } from "../src/plugin.js";

describe("createProgram", () => {
  it("configures the CLI name", () => {
    expect(createProgram().name()).toBe("opencode-md-management");
  });

  it("registers management commands", () => {
    const commands = createProgram().commands.map((command) => command.name());

    expect(commands).toEqual(expect.arrayContaining([
      "init",
      "doctor",
      "audit",
      "sync",
      "revise",
      "learn",
      "proposal:show",
      "proposal:list",
      "proposal:approve",
      "proposal:reject",
      "proposal:gc"
    ]));
  });

  it("registers proposal lifecycle command options", () => {
    const commands = createProgram().commands;
    const list = commands.find((command) => command.name() === "proposal:list");
    const reject = commands.find((command) => command.name() === "proposal:reject");
    const gc = commands.find((command) => command.name() === "proposal:gc");

    expect(list?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--status", "--json"]));
    expect(reject?.options.map((option) => option.long)).toContain("--reason");
    expect(gc?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--older-than-days", "--status"]));
  });

  it("registers OpenCode plugin tools", async () => {
    const hooks = await OpencodeMdManagement({} as never);

    expect(Object.keys(hooks.tool ?? {})).toEqual(expect.arrayContaining([
      "agent_md_init",
      "agent_md_doctor",
      "agent_md_audit",
      "agent_md_sync",
      "agent_md_revise",
      "agent_md_learn",
      "agent_md_proposal_show",
      "agent_md_proposal_list",
      "agent_md_proposal_approve",
      "agent_md_proposal_reject",
      "agent_md_proposal_gc"
    ]));
  });
});
