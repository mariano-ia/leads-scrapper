import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest is configured and Node version is 20+", () => {
    const major = parseInt(process.versions.node.split(".")[0]!, 10);
    expect(major).toBeGreaterThanOrEqual(20);
  });

  it("project metadata is loadable from package.json", async () => {
    const pkg = await import("../package.json");
    expect(pkg.default.name).toBe("@leads-scrapper/web");
  });
});
