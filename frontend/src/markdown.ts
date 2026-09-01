import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

export interface Heading {
  text: string;
  level: number;
  id: string;
}

function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "secao"
  );
}

/** Renders markdown to sanitized HTML and returns the h2/h3 outline, with matching ids injected for anchor links. */
export function renderMarkdownWithToc(md: string): { html: string; headings: Heading[] } {
  const tokens = marked.lexer(md);
  const headings: Heading[] = [];
  for (const token of tokens) {
    if (token.type === "heading" && (token.depth === 2 || token.depth === 3)) {
      headings.push({ text: token.text, level: token.depth, id: slugifyHeading(token.text) });
    }
  }

  let html = marked.parse(md, { async: false }) as string;
  let i = 0;
  html = html.replace(/<h([23])>/g, (match, level) => {
    const heading = headings[i];
    i += 1;
    return heading ? `<h${level} id="${heading.id}">` : match;
  });

  return { html: DOMPurify.sanitize(html), headings };
}
