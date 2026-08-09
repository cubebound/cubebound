/**
 * Renders adversarial markdown through the real Primer component and fails if
 * anything executable or navigable-to-script survives.
 *
 *   npm run check:primer-safety
 *
 * Primers are written by one user and shown to others, so this is the check
 * that stands between a cube author and stored XSS. It renders to static HTML
 * with the same component the cube page uses — if the component changes (a
 * plugin added, the schema loosened), this fails.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as primerModule from "../src/components/primer";

/**
 * tsx compiles the .tsx to CJS, and the ESM/CJS interop here nests the default
 * export (`module.default.default`), so unwrap until a function turns up.
 */
function resolveComponent(mod: unknown): React.FunctionComponent<{ markdown: string }> {
  let candidate: unknown = mod;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth++) {
    candidate = (candidate as Record<string, unknown>).default;
  }
  if (typeof candidate !== "function") {
    throw new Error("could not resolve the Primer component from its module");
  }
  return candidate as React.FunctionComponent<{ markdown: string }>;
}

const Primer = resolveComponent(primerModule);

interface Case {
  name: string;
  markdown: string;
  /** Substrings that must NOT appear in the rendered HTML. */
  forbidden: string[];
  /** Substrings that must appear, so we know the content rendered at all. */
  required?: string[];
}

const cases: Case[] = [
  {
    name: "script tag",
    markdown: "Hello\n\n<script>alert(1)</script>\n\nBye",
    forbidden: ["<script", "alert(1)"],
    required: ["Hello"],
  },
  {
    name: "img onerror",
    markdown: `<img src=x onerror="alert(1)">`,
    forbidden: ["onerror", "<img"],
  },
  {
    name: "javascript: link",
    markdown: "[click me](javascript:alert(1))",
    forbidden: ["javascript:"],
    required: ["click me"],
  },
  {
    name: "javascript: link with mixed case and entities",
    markdown: "[x](JaVaScRiPt:alert(1))\n\n[y](java&#115;cript:alert(1))",
    forbidden: ["javascript:", "JaVaScRiPt:"],
  },
  {
    name: "data: URL",
    markdown: "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    forbidden: ["data:text/html"],
  },
  {
    name: "iframe",
    markdown: `<iframe src="https://evil.example"></iframe>`,
    forbidden: ["<iframe"],
  },
  {
    name: "svg onload",
    markdown: `<svg><animate onbegin="alert(1)" /></svg>`,
    forbidden: ["<svg", "onbegin"],
  },
  {
    name: "style tag and inline style",
    markdown: `<style>body{display:none}</style>\n\n<p style="position:fixed">x</p>`,
    forbidden: ["<style", "position:fixed"],
  },
  {
    name: "event handler on an allowed tag",
    markdown: `<a href="https://example.com" onclick="alert(1)">link</a>`,
    forbidden: ["onclick"],
  },
  {
    name: "markdown image pointing at a script-ish url",
    markdown: "![alt](javascript:alert(1))",
    forbidden: ["javascript:"],
  },
  {
    name: "html comment with conditional",
    markdown: "<!--[if IE]><script>alert(1)</script><![endif]-->",
    forbidden: ["<script", "alert(1)"],
  },
  {
    name: "base tag",
    markdown: `<base href="https://evil.example/">`,
    forbidden: ["<base"],
  },
  {
    name: "form and input",
    markdown: `<form action="https://evil.example"><input name="password"></form>`,
    forbidden: ["<form", "<input"],
  },
];

/** Legitimate markdown must still render, or the sanitizer is too aggressive. */
const positives: Case[] = [
  {
    name: "headings, emphasis, lists",
    markdown: "# Title\n\nSome **bold** and *italic*.\n\n- one\n- two",
    forbidden: [],
    required: ["<h1", "<strong", "<em", "<ul", "<li"],
  },
  {
    name: "safe link keeps rel and opens in a new tab",
    markdown: "[Cube Cobra](https://cubecobra.com)",
    forbidden: [],
    required: ['href="https://cubecobra.com"', 'rel="nofollow ugc noreferrer"', 'target="_blank"'],
  },
  {
    name: "gfm table and strikethrough",
    markdown: "| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~",
    forbidden: [],
    required: ["<table", "<td", "<del"],
  },
  {
    name: "code block is escaped, not executed",
    markdown: "```\n<script>alert(1)</script>\n```",
    forbidden: ["<script>"],
    required: ["<pre", "&lt;script&gt;"],
  },
];

const failures: string[] = [];

for (const testCase of [...cases, ...positives]) {
  let html: string;
  try {
    html = renderToStaticMarkup(createElement(Primer, { markdown: testCase.markdown }));
  } catch (error) {
    failures.push(`${testCase.name}: render threw — ${(error as Error).message}`);
    continue;
  }

  for (const needle of testCase.forbidden) {
    if (html.toLowerCase().includes(needle.toLowerCase())) {
      failures.push(
        `${testCase.name}: rendered output contains "${needle}" — ${html.slice(0, 200)}`,
      );
    }
  }
  for (const needle of testCase.required ?? []) {
    if (!html.includes(needle)) {
      failures.push(
        `${testCase.name}: expected "${needle}" in output — ${html.slice(0, 200)}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`primer safety check FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log(`primer safety check passed (${cases.length} hostile, ${positives.length} benign)`);
