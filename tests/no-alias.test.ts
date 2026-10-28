import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const SCHEMA = join("src", "server", "db", "schema");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("no alias concept", () => {
  it("nothing in src reads or writes userAliases except the legacy schema definition", () => {
    const offenders = files(SRC)
      .filter((f) => !relative(process.cwd(), f).startsWith(SCHEMA + sep))
      .filter((f) => /userAliases|user_aliases/.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });

  it("the alias helper module is gone", () => {
    expect(() => statSync(join(SRC, "lib", "alias.ts"))).toThrow();
  });
});
