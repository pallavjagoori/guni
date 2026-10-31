import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans-var" }),
  Geist_Mono: () => ({ variable: "font-mono-var" }),
}));

describe("root layout", () => {
  it("sets the page title and wraps content with the fonts", async () => {
    const { default: RootLayout, metadata } = await import("./layout");
    expect(metadata.title).toBe("Guni");
    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>child</p>
      </RootLayout>,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("font-sans-var font-mono-var");
    expect(html).toContain("<p>child</p>");
  });
});
