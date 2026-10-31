import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MathText } from "./math-text";

describe("MathText", () => {
  it("renders inline LaTeX with KaTeX", () => {
    const html = renderToStaticMarkup(<MathText>{"Field is $\\frac{\\mu_0 I}{2\\pi a}$ here"}</MathText>);
    expect(html).toContain('class="katex"');
    expect(html).toContain("<p>Field is ");
    expect(html).toContain("<mfrac>");
  });

  it("renders display math and Markdown lists", () => {
    const html = renderToStaticMarkup(<MathText>{"$$\nE = mc^2\n$$\n\n- (i) one\n- (ii) two"}</MathText>);
    expect(html).toContain("katex-display");
    expect(html).toContain("<li>(i) one</li>");
  });

  it("shows a formula it can't parse instead of throwing", () => {
    const html = renderToStaticMarkup(<MathText>{"$\\frac{1$"}</MathText>);
    expect(html).toContain("katex-error");
  });

  it("drops the paragraph wrapper inline", () => {
    const html = renderToStaticMarkup(<MathText inline>{"$5\\sqrt{2}$ V"}</MathText>);
    expect(html.startsWith("<p>")).toBe(false);
    expect(html).toContain("katex");
  });
});
