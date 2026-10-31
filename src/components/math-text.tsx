import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

// Renders question text: Markdown with LaTeX between $...$ (inline) or $$...$$ (display).
// A formula KaTeX can't parse is shown in red instead of breaking the page.
export function MathText({ children, inline = false }: { children: string; inline?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      // Inline use (options, marking steps) must not wrap text in a block <p>.
      components={inline ? { p: ({ children }) => <>{children}</> } : undefined}
    >
      {children}
    </ReactMarkdown>
  );
}
