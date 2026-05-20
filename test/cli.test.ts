import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";

describe("createProgram", () => {
  it("configures the CLI name", () => {
    expect(createProgram().name()).toBe("opencode-md-management");
  });
});
