import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import hljs from "highlight.js";

interface MarkdownRendererProps {
  text: string;
  className?: string;
}

export function MarkdownRenderer({ text, className }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    try {
      return marked.parse(text, { async: false }) as string;
    } catch {
      return `<pre>${escapeHtml(text)}</pre>`;
    }
  }, [text]);

  // Apply highlight.js to all code blocks after render
  useEffect(() => {
    if (!containerRef.current) return;
    const codeBlocks = containerRef.current.querySelectorAll("pre code");
    for (const block of codeBlocks) {
      if (block.classList.length === 0) {
        // Auto-detect language
        hljs.highlightElement(block as HTMLElement);
      }
    }
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`markdown-body ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
