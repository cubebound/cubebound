import Markdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/**
 * Renders a cube's primer.
 *
 * Safety, in layers, because this is user-written text shown to other people:
 *  - `rehype-raw` is deliberately NOT used, so embedded HTML in the markdown is
 *    never parsed into elements.
 *  - `rehype-sanitize` runs anyway as a second line of defence, with the schema
 *    narrowed to the tags a write-up actually needs.
 *  - `urlTransform` allows only http/https/mailto, blocking `javascript:` and
 *    `data:` links.
 *  - External links get `rel="nofollow ugc noreferrer"` so the site isn't
 *    lending its reputation to whatever an author points at.
 *
 * `scripts/check-primer-safety.mts` renders adversarial input against this
 * component and fails if anything executable survives.
 */

/** Tags a cube write-up needs, and nothing that can execute or embed. */
const schema = {
  ...defaultSchema,
  tagNames: [
    "p", "br", "hr", "blockquote", "pre", "code", "em", "strong", "del",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "a",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  attributes: {
    a: ["href", "title"],
    code: ["className"],
    th: ["align"],
    td: ["align"],
  },
  protocols: { href: ["http", "https", "mailto"] },
};

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

function safeUrl(url: string): string {
  const trimmed = url.trim();
  // Relative links stay; anything with a scheme must be one we allow.
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return SAFE_PROTOCOL.test(trimmed) ? trimmed : "";
}

export default function Primer({ markdown }: { markdown: string }) {
  return (
    <div className="primer max-w-3xl text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={safeUrl}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="nofollow ugc noreferrer"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
