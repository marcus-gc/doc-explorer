import React, { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import ruby from 'highlight.js/lib/languages/ruby';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import erb from 'highlight.js/lib/languages/erb';
import css from 'highlight.js/lib/languages/css';
import yaml from 'highlight.js/lib/languages/yaml';
import json from 'highlight.js/lib/languages/json';

hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('erb', erb);
hljs.registerLanguage('slim', ruby);
hljs.registerLanguage('css', css);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);

const LANG_MAP = {
  rb: 'ruby',
  js: 'javascript',
  jsx: 'jsx',
  ts: 'javascript',
  tsx: 'javascript',
  erb: 'erb',
  slim: 'slim',
  html: 'html',
  css: 'css',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
};

/**
 * Split highlighted HTML into per-line chunks, keeping tags balanced.
 * hljs output uses <span class="hljs-*">…</span> which may span multiple lines.
 * We track open spans and re-open them at the start of each new line.
 */
function splitHighlightedLines(html) {
  const lines = html.split('\n');
  const result = [];
  let openSpans = []; // stack of '<span …>' strings

  for (const rawLine of lines) {
    // Re-open any spans from previous lines
    let prefix = openSpans.join('');
    let lineHtml = prefix + rawLine;

    // Track span opens/closes in this line to update openSpans for next line
    const openRe = /<span[^>]*>/g;
    const closeRe = /<\/span>/g;

    const opens = rawLine.match(openRe) || [];
    const closes = rawLine.match(closeRe) || [];

    // Each close cancels the most recent open
    for (const _ of closes) openSpans.pop();
    for (const tag of opens) openSpans.push(tag);

    // Close any still-open spans at the end of this line for valid HTML
    let suffix = '</span>'.repeat(openSpans.length);
    result.push(lineHtml + suffix);
  }

  return result;
}

/**
 * Renders a code snippet with line numbers and syntax highlighting.
 * Focus lines (the requested range) are displayed normally;
 * context lines (above/below) are slightly dimmed.
 */
export default function CodeBlock({ code, language, contextStartLine, focusStartLine, focusEndLine }) {
  if (!code) return null;

  const hljsLang = LANG_MAP[language] || language || null;

  const highlightedLines = useMemo(() => {
    let html;
    try {
      const langRegistered = hljs.getLanguage(hljsLang);
      if (hljsLang && langRegistered) {
        const result = hljs.highlight(code, { language: hljsLang });
        html = result.value;
      } else {
        const result = hljs.highlightAuto(code);
        html = result.value;
      }
    } catch (e) {
      // Fallback: escape HTML and use plain text
      html = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    return splitHighlightedLines(html);
  }, [code, hljsLang]);

  const startNum = contextStartLine || 1;

  return (
    <div className="code-block">
      <pre>
        <code>
          {highlightedLines.map((lineHtml, i) => {
            const lineNum = startNum + i;
            const isFocus = lineNum >= focusStartLine && lineNum <= focusEndLine;
            return (
              <div
                key={i}
                className={`code-line ${isFocus ? 'code-line--focus' : 'code-line--context'}`}
              >
                <span className="code-line-number">{lineNum}</span>
                <span
                  className="code-line-content"
                  dangerouslySetInnerHTML={{ __html: lineHtml }}
                />
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
