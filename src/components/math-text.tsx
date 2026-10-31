// Shows transcribed text with its LaTeX formulas typeset. Only $...$ (inline) and $$...$$
// (display) are special; everything else, line breaks included, is shown exactly as stored.
import katex from "katex";
import "katex/dist/katex.min.css";

type Part = { math: false; text: string } | { math: true; tex: string; display: boolean };

// $$...$$, or $...$ that doesn't start or end with a space and isn't followed by a digit,
// so prices like "$5 and $10" stay text. \$ is a literal dollar sign.
const MATH = /\$\$([\s\S]+?)\$\$|\$(?=\S)((?:\\.|[^$\\])+?)(?<=\S)\$(?!\d)/g;

/**
 * Splits text into plain-text and formula parts.
 * @param text - Text with $...$ and $$...$$ formulas.
 * @returns The parts in order; formulas carry their TeX and whether they are displayed.
 */
export function splitMath(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) parts.push({ math: false, text: text.slice(last, m.index) });
    parts.push(m[1] !== undefined ? { math: true, tex: m[1], display: true } : { math: true, tex: m[2], display: false });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ math: false, text: text.slice(last) });
  return parts.map((p) => (p.math ? p : { math: false, text: p.text.replace(/\\\$/g, "$") }));
}

/**
 * Shows transcribed text with its formulas typeset by KaTeX. Broken formulas show as an error, not a crash.
 * @param props.children - The stored text.
 * @param props.inline - Render inside a span (options, steps) instead of a block.
 */
export function MathText({ children, inline = false }: { children: string; inline?: boolean }) {
  const Tag = inline ? "span" : "div";
  return (
    <Tag className="whitespace-pre-wrap">
      {splitMath(children).map((p, i) =>
        p.math ? (
          <span
            key={i}
            className={p.display ? "block overflow-x-auto py-1" : undefined}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(p.tex, { displayMode: p.display, throwOnError: false, strict: false }),
            }}
          />
        ) : (
          p.text
        ),
      )}
    </Tag>
  );
}
