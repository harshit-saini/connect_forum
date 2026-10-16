import { test as base, expect } from "@playwright/test";

/** Every test fails on hydration mismatches or uncaught page errors. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat|did not match|Content Security Policy|Refused to (?:apply|execute|load|connect)/i.test(m.text())) problems.push(`[${page.url()}] ${m.text().slice(0, 600)}`);
    });
    page.on("pageerror", (e) => problems.push(`[${page.url()}] ${e.message.slice(0, 600)}`));
    await provide(page);
    expect(problems, "browser errors").toEqual([]);
  },
});
export { expect };
