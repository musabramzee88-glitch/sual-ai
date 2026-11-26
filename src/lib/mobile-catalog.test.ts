import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mobileCatalog } from "./mobile-catalog";

describe("mobile catalog", () => {
  it("mobile/lib/catalog.g.dart matches the website's lists (run: npx tsx scripts/gen-mobile-catalog.ts)", () => {
    expect(readFileSync("mobile/lib/catalog.g.dart", "utf8")).toBe(mobileCatalog());
  });
});
