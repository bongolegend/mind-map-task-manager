"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type Props = {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  /** Larger focus title styling */
  as?: "title" | "body" | "meta";
};

export function InlineEditable({
  value,
  onSave,
  className = "",
  placeholder = "Untitled",
  multiline = false,
  as = "body",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim() || placeholder;
    setEditing(false);
    if (next !== value) onSave(next);
    else setDraft(value);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  const size =
    as === "title"
      ? "text-2xl font-semibold tracking-tight leading-snug"
      : as === "meta"
        ? "text-sm leading-relaxed"
        : "text-base leading-snug";

  if (editing) {
    const shared =
      `w-full bg-transparent outline-none border-b border-[var(--accent)] ${size} ${className}`;
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          rows={3}
          className={`${shared} resize-none`}
          placeholder={placeholder}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={shared}
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`w-full text-left rounded-sm hover:bg-[var(--hover)] -mx-1 px-1 transition-colors ${size} ${className} ${
        !value ? "text-[var(--muted)]" : ""
      }`}
    >
      {value || placeholder}
    </button>
  );
}
