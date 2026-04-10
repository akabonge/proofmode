"use client";

import { useEffect, useRef } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

type ToolbarAction = {
  label: string;
  command?: string;
  value?: string;
  ariaLabel?: string;
};

const HISTORY_ACTIONS: ToolbarAction[] = [
  { label: "Undo", command: "undo" },
  { label: "Redo", command: "redo" },
];

const INLINE_ACTIONS: ToolbarAction[] = [
  { label: "B", command: "bold", ariaLabel: "Bold" },
  { label: "I", command: "italic", ariaLabel: "Italic" },
  { label: "U", command: "underline", ariaLabel: "Underline" },
];

const BLOCK_ACTIONS: ToolbarAction[] = [
  { label: "H1", command: "formatBlock", value: "h1", ariaLabel: "Heading 1" },
  { label: "H2", command: "formatBlock", value: "h2", ariaLabel: "Heading 2" },
  { label: "Quote", command: "formatBlock", value: "blockquote" },
  { label: "Bullets", command: "insertUnorderedList" },
  { label: "Numbers", command: "insertOrderedList" },
];

const CLEANUP_ACTIONS: ToolbarAction[] = [{ label: "Clear", command: "removeFormat" }];

function sanitizeEditorHtml(value: string) {
  return value.trim() ? value : "";
}

export function extractPlainTextFromHtml(value: string) {
  if (typeof window === "undefined") {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = value;
  return (el.textContent || el.innerText || "").replace(/\s+/g, " ").trim();
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing...",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = sanitizeEditorHtml(value);
    }
  }, [value]);

  function emitChange() {
    if (!editorRef.current) return;
    const nextHtml = sanitizeEditorHtml(editorRef.current.innerHTML);
    onChange(nextHtml);
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  }

  return (
    <div className="writer-shell">
      <div className="writer-toolbar" role="toolbar" aria-label="Writing toolbar">
        <div className="writer-toolbar-group">
          {HISTORY_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="writer-button secondary"
              aria-label={action.ariaLabel || action.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(action.command!, action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="writer-toolbar-divider" aria-hidden="true" />

        <div className="writer-toolbar-group">
          <select
            className="writer-select"
            defaultValue="p"
            onChange={(e) => runCommand("formatBlock", e.target.value)}
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="blockquote">Quote</option>
          </select>
        </div>

        <div className="writer-toolbar-divider" aria-hidden="true" />

        <div className="writer-toolbar-group">
          {INLINE_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="writer-button secondary"
              aria-label={action.ariaLabel || action.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(action.command!, action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="writer-toolbar-divider" aria-hidden="true" />

        <div className="writer-toolbar-group">
          {BLOCK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="writer-button secondary"
              aria-label={action.ariaLabel || action.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(action.command!, action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="writer-toolbar-divider" aria-hidden="true" />

        <div className="writer-toolbar-group">
          {CLEANUP_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="writer-button secondary"
              aria-label={action.ariaLabel || action.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(action.command!, action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="writer-canvas-wrap">
        <div
          ref={editorRef}
          className="writer-canvas"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={emitChange}
        />
      </div>
    </div>
  );
}
