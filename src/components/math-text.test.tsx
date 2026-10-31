import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MathText, splitMath } from "./math-text";

describe("splitMath", () => {
  it("separates inline and display formulas from text", () => {
    expect(splitMath("F = $qE$ and\n$$\\frac{1}{2}$$ end")).toEqual([
      { math: false, text: "F = " },
      { math: true, tex: "qE", display: false },
      { math: false, text: " and\n" },
      { math: true, tex: "\\frac{1}{2}", display: true },
      { math: false, text: " end" },
    ]);
  });

  it("leaves prices, spaced dollars and escaped dollars as text", () => {
    expect(splitMath("costs $5 and $10")).toEqual([{ math: false, text: "costs $5 and $10" }]);
    expect(splitMath("a $ b $ c")).toEqual([{ math: false, text: "a $ b $ c" }]);
    expect(splitMath("pay \\$3")).toEqual([{ math: false, text: "pay $3" }]);
  });

  it("keeps an escaped dollar inside a formula", () => {
    expect(splitMath("$a\\$b$")).toEqual([{ math: true, tex: "a\\$b", display: false }]);
  });

  it("handles text that is only a formula, or has none", () => {
    expect(splitMath("$x$")).toEqual([{ math: true, tex: "x", display: false }]);
    expect(splitMath("")).toEqual([]);
  });
});

describe("MathText", () => {
  it("typesets formulas and keeps other text literal", () => {
    const html = renderToStaticMarkup(<MathText>{"*Note* 2*3\nField $\\frac{q}{r^2}$"}</MathText>);
    expect(html).toMatch(/^<div class="whitespace-pre-wrap">/);
    expect(html).toContain("*Note* 2*3\nField ");
    expect(html).toContain("<mfrac>");
  });

  it("shows display formulas as their own block", () => {
    const html = renderToStaticMarkup(<MathText>{"$$E = mc^2$$"}</MathText>);
    expect(html).toContain('class="block overflow-x-auto py-1"');
    expect(html).toContain("katex-display");
  });

  it("shows a broken formula as an error instead of failing the page", () => {
    expect(renderToStaticMarkup(<MathText>{"$\\frac{1$"}</MathText>)).toContain("katex-error");
  });

  it("renders inside a span in inline mode", () => {
    const html = renderToStaticMarkup(<MathText inline>{"1. Direction $x$"}</MathText>);
    expect(html).toMatch(/^<span class="whitespace-pre-wrap">1\. Direction /);
  });
});
