import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react-dom';
import CodeBlock from './CodeBlock';

const EDITOR_URL_BUILDERS = {
  vscode: (path, line) => `vscode://file/${path}:${line}`,
  cursor: (path, line) => `cursor://file/${path}:${line}`,
  webstorm: (path, line) => `webstorm://open?file=${path}&line=${line}`,
  rubymine: (path, line) => `rubymine://open?file=${path}&line=${line}`,
  sublime: (path, line) => `subl://open?url=file://${path}&line=${line}`,
  mvim: (path, line) => `mvim://open?url=file://${path}&line=${line}`,
};

function editorUrl(editor, projectRoot, relativePath, line) {
  const fullPath = `${projectRoot}/${relativePath}`;
  const builder = EDITOR_URL_BUILDERS[editor] || EDITOR_URL_BUILDERS.vscode;
  return builder(fullPath, line || 1);
}

const MAX_FULL_FILE_LINES = 100;
const CONTEXT_LINES = 2;

export default function NodePopover({ fileRef, sourceFiles, anchorEl, onClose }) {
  const popoverRef = useRef(null);
  const { file, startLine, endLine } = fileRef;
  const fileData = sourceFiles?.[file];

  const snippet = useMemo(() => {
    if (!fileData?.content) return null;
    const lines = fileData.content.split('\n');
    if (!startLine) {
      // Full file display
      if (lines.length > MAX_FULL_FILE_LINES) {
        return {
          code: lines.slice(0, MAX_FULL_FILE_LINES).join('\n') + '\n\n// ... truncated ...',
          contextStartLine: 1,
          focusStartLine: 1,
          focusEndLine: MAX_FULL_FILE_LINES,
          truncated: true,
          totalLines: lines.length,
        };
      }
      return {
        code: fileData.content,
        contextStartLine: 1,
        focusStartLine: 1,
        focusEndLine: lines.length,
      };
    }
    // Line-range display with context
    const ctxStart = Math.max(0, startLine - 1 - CONTEXT_LINES);
    const ctxEnd = Math.min(lines.length, endLine + CONTEXT_LINES);
    return {
      code: lines.slice(ctxStart, ctxEnd).join('\n'),
      contextStartLine: ctxStart + 1,
      focusStartLine: startLine,
      focusEndLine: endLine,
    };
  }, [fileData, startLine, endLine]);

  const [editor] = useState(() => localStorage.getItem('docs-editor-preference') || 'vscode');

  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchorEl },
    placement: 'bottom',
    middleware: [offset(12), flip({ padding: 20 }), shift({ padding: 20 })],
    whileElementsMounted: autoUpdate,
  });

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Delay to avoid the click that opened the popover from immediately closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const repoPath = localStorage.getItem('docs-repo-path') || '';
  const href = repoPath ? editorUrl(editor, repoPath, file, startLine || 1) : null;

  return (
    <div
      ref={(el) => {
        popoverRef.current = el;
        refs.setFloating(el);
      }}
      className="node-popover"
      style={floatingStyles}
    >
      <header className="node-popover-header">
        <div className="node-popover-file-info">
          {href ? (
            <a className="node-popover-file-path" href={href} title="Open in editor">
              {file}
            </a>
          ) : (
            <span className="node-popover-file-path" title="Set repo path in settings to enable editor links">
              {file}
            </span>
          )}
          {startLine && (
            <span className="node-popover-line-range">
              L{startLine}&ndash;{endLine}
            </span>
          )}
        </div>
        <button className="node-popover-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </header>

      {fileData?.language && (
        <div className="node-popover-language">{fileData.language}</div>
      )}

      {snippet ? (
        <div className="node-popover-code-wrapper">
          <CodeBlock
            code={snippet.code}
            language={fileData?.language}
            contextStartLine={snippet.contextStartLine}
            focusStartLine={snippet.focusStartLine}
            focusEndLine={snippet.focusEndLine}
          />
        </div>
      ) : fileData?.error ? (
        <div className="node-popover-error">File not found in repository</div>
      ) : (
        <div className="node-popover-error">No code snippet available</div>
      )}

      {snippet?.truncated && (
        <div className="node-popover-truncated">
          Showing first {snippet.focusEndLine} of {snippet.totalLines} lines
        </div>
      )}
    </div>
  );
}
