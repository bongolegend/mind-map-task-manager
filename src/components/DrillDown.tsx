"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { InlineEditable } from "./InlineEditable";
import {
  creatableChildTypes,
  sectionLabelFor,
  TYPE_LABELS,
  type Entity,
  type EntityType,
  type Store,
} from "@/lib/types";
import { ROOT_ID } from "@/lib/types";

type Props = {
  store: Store;
  onStoreChange: (store: Store) => void;
};

function getListedChildren(store: Store, focusId: string): Entity[] {
  const focus = store.entities[focusId];
  if (!focus) return [];

  if (focus.type === "bet") {
    const taskIds = (store.children[focusId] ?? []).filter(
      (id) => store.entities[id]?.type === "task",
    );
    const peopleIds = store.betPeople[focusId] ?? [];
    return [...taskIds, ...peopleIds]
      .map((id) => store.entities[id])
      .filter(Boolean);
  }

  return (store.children[focusId] ?? [])
    .map((id) => store.entities[id])
    .filter(Boolean);
}

function childCount(store: Store, id: string): number {
  return getListedChildren(store, id).length;
}

/** Group consecutive children by type for section labels */
function groupByType(entities: Entity[]): { type: EntityType; items: Entity[] }[] {
  const groups: { type: EntityType; items: Entity[] }[] = [];
  for (const item of entities) {
    const last = groups[groups.length - 1];
    if (last && last.type === item.type) {
      last.items.push(item);
    } else {
      groups.push({ type: item.type, items: [item] });
    }
  }
  return groups;
}

export function DrillDown({ store, onStoreChange }: Props) {
  /** Navigation stack: [root, ..., focus]. Last id is current focus. */
  const [path, setPath] = useState<string[]>([ROOT_ID]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<EntityType>>(
    () => new Set(),
  );
  const [busy, setBusy] = useState(false);

  const focusId = path[path.length - 1] ?? ROOT_ID;
  const parentId = path.length > 1 ? path[path.length - 2] : null;
  const focus = store.entities[focusId];
  const parent = parentId ? store.entities[parentId] : null;

  const children = useMemo(
    () => getListedChildren(store, focusId),
    [store, focusId],
  );
  const groups = useMemo(() => groupByType(children), [children]);

  async function refreshStore(): Promise<Store | null> {
    try {
      const res = await fetch("/api/store");
      if (!res.ok) return null;
      const data = (await res.json()) as Store;
      onStoreChange(data);
      // Drop path entries that no longer exist
      setPath((p) => {
        const valid = p.filter((id) => data.entities[id]);
        return valid.length > 0 ? valid : [ROOT_ID];
      });
      return data;
    } catch {
      return null;
    }
  }

  async function patchEntity(id: string, patch: Record<string, string | undefined>) {
    // Skip if we already know it's gone (avoids noisy 404s after delete/rename races)
    if (!store.entities[id]) {
      await refreshStore();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Stale client state (e.g. entity deleted, or store reset under us)
        await refreshStore();
        return;
      }
      onStoreChange(data.store);
    } catch {
      await refreshStore();
    } finally {
      setBusy(false);
    }
  }

  async function addChild(type: EntityType) {
    setBusy(true);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: focusId, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        await refreshStore();
        return;
      }
      onStoreChange(data.store);
    } catch {
      await refreshStore();
    } finally {
      setBusy(false);
    }
  }

  async function removeEntity(id: string) {
    const entity = store.entities[id];
    if (!entity || entity.type === "root") return;
    const label = TYPE_LABELS[entity.type].toLowerCase();
    const ok = window.confirm(
      `Delete this ${label}? Nested items it owns will be deleted too.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/store", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        await refreshStore();
        return;
      }
      onStoreChange(data.store);
      // If we deleted the focus (or something above us), step back
      setPath((p) => {
        const idx = p.indexOf(id);
        if (idx === -1) return p;
        const next = p.slice(0, idx);
        return next.length > 0 ? next : [ROOT_ID];
      });
      setDetailsOpen(false);
      setCollapsedSections(new Set());
    } catch {
      await refreshStore();
    } finally {
      setBusy(false);
    }
  }

  function drillInto(id: string) {
    setPath((p) => [...p, id]);
    setDetailsOpen(false);
    setCollapsedSections(new Set());
  }

  function goUp() {
    if (path.length <= 1) return;
    setPath((p) => p.slice(0, -1));
    setDetailsOpen(false);
    setCollapsedSections(new Set());
  }

  function toggleSection(type: EntityType) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (!focus) {
    return (
      <div className="p-6 text-[var(--muted)]">
        Missing entity.{" "}
        <button type="button" className="underline" onClick={() => setPath([ROOT_ID])}>
          Back to workspace
        </button>
      </div>
    );
  }

  const creatable = creatableChildTypes(focus.type);
  const showDetails = focus.type !== "root";
  /** Title every list we show; if none yet, still name the expected sections. */
  const listGroups: { type: EntityType; items: Entity[] }[] =
    groups.length > 0
      ? groups
      : creatable.map((type) => ({ type, items: [] }));

  return (
    <div
      className={`mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-16 pt-6 ${
        busy ? "opacity-70 pointer-events-none" : ""
      }`}
    >
      {/* Parent */}
      {parent ? (
        <button
          type="button"
          onClick={goUp}
          className="mb-4 flex items-center gap-1.5 self-start text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <span aria-hidden="true">←</span>
          <span className="truncate max-w-[16rem]">{parent.title}</span>
        </button>
      ) : (
        <div className="mb-4 h-5" />
      )}

      {/* Focus — type label above; click toggles details, double-click edits */}
      <div className="mb-2">
        {focus.type !== "root" && (
          <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">
            {TYPE_LABELS[focus.type]}
          </p>
        )}
        {focus.type === "root" ? (
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--muted)]">
            {focus.title}
          </h1>
        ) : (
          <FocusTitle
            value={focus.title}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((o) => !o)}
            onSave={(title) => patchEntity(focus.id, { title })}
          />
        )}
      </div>

      {/* Metadata — expanded via focus title click */}
      {showDetails && detailsOpen && (
        <div className="mb-4 mt-1 space-y-3 border-l-2 border-[var(--rule)] pl-3">
          <MetaRow label="Due" layout="inline">
            <input
              type="date"
              value={focus.dueDate ?? ""}
              onChange={(e) =>
                patchEntity(focus.id, {
                  dueDate: e.target.value,
                })
              }
              className="bg-transparent text-sm outline-none border-b border-transparent focus:border-[var(--accent)] text-[var(--foreground)]"
            />
          </MetaRow>
          {focus.type === "person" && (
            <>
              <MetaRow label="Role" layout="inline">
                <InlineEditable
                  value={focus.role ?? ""}
                  as="meta"
                  placeholder="Role"
                  onSave={(role) => patchEntity(focus.id, { role })}
                />
              </MetaRow>
              <MetaRow label="Firm" layout="inline">
                <InlineEditable
                  value={focus.firm ?? ""}
                  as="meta"
                  placeholder="Firm"
                  onSave={(firm) => patchEntity(focus.id, { firm })}
                />
              </MetaRow>
            </>
          )}
          {focus.type === "task" && (
            <MetaRow label="Status" layout="inline">
              <select
                value={focus.status ?? "todo"}
                onChange={(e) =>
                  patchEntity(focus.id, { status: e.target.value })
                }
                className="bg-transparent text-sm outline-none border-b border-transparent focus:border-[var(--accent)]"
              >
                <option value="todo">todo</option>
                <option value="doing">doing</option>
                <option value="done">done</option>
              </select>
            </MetaRow>
          )}
          {focus.type === "interaction" && (
            <MetaRow label="Date" layout="inline">
              <input
                type="date"
                value={focus.date ?? ""}
                onChange={(e) =>
                  patchEntity(focus.id, {
                    date: e.target.value,
                  })
                }
                className="bg-transparent text-sm outline-none border-b border-transparent focus:border-[var(--accent)] text-[var(--foreground)]"
              />
            </MetaRow>
          )}
          <MetaRow label="Notes" layout="stack">
            <InlineEditable
              value={focus.notes ?? ""}
              as="meta"
              multiline
              placeholder="Add notes…"
              onSave={(notes) => patchEntity(focus.id, { notes })}
            />
          </MetaRow>
          <button
            type="button"
            onClick={() => removeEntity(focus.id)}
            className="pt-1 text-sm text-[var(--muted)] hover:text-red-700 transition-colors"
          >
            Delete {TYPE_LABELS[focus.type].toLowerCase()}
          </button>
        </div>
      )}

      <div className="my-2 border-t border-[var(--rule)]" />

      {/* Children — always titled by type; sections collapse */}
      <div className="mt-4 flex flex-col gap-1">
        {listGroups.map((group) => {
          const open = !collapsedSections.has(group.type);
          return (
            <div key={group.type} className="mb-4">
              <button
                type="button"
                onClick={() => toggleSection(group.type)}
                aria-expanded={open}
                className="mb-2 flex w-full items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <span>{sectionLabelFor(group.type)}</span>
                <span aria-hidden="true" className="font-normal">
                  {open ? "▾" : "▸"}
                </span>
                {!open && group.items.length > 0 && (
                  <span className="font-normal normal-case tracking-normal text-[var(--faint)]">
                    ({group.items.length})
                  </span>
                )}
              </button>
              {open &&
                (group.items.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-[var(--muted)]">
                    Nothing here yet.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {group.items.map((item) => {
                      const count = childCount(store, item.id);
                      return (
                        <li key={item.id} className="group flex items-stretch">
                          <ListRow
                            title={item.title}
                            childCount={count}
                            onOpen={() => drillInto(item.id)}
                            onRename={(title) =>
                              patchEntity(item.id, { title })
                            }
                          />
                          <button
                            type="button"
                            title={`Delete ${TYPE_LABELS[item.type].toLowerCase()}`}
                            aria-label={`Delete ${item.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeEntity(item.id);
                            }}
                            className="shrink-0 self-center rounded-md px-2 py-1 text-sm text-[var(--faint)] hover:bg-[var(--hover)] hover:text-red-700 transition-colors"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ))}
            </div>
          );
        })}
      </div>

      {/* Add children */}
      {creatable.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {creatable.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addChild(type)}
              className="rounded-md px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-colors"
            >
              + {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** List row: single-click drills in, double-click renames in place. */
function ListRow({
  title,
  childCount,
  onOpen,
  onRename,
}: {
  title: string;
  childCount: number;
  onOpen: () => void;
  onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  function commit() {
    const next = draft.trim() || "Untitled";
    setEditing(false);
    if (next !== title) onRename(next);
    else setDraft(title);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(title);
      setEditing(false);
    }
  }

  function handleClick() {
    if (editing) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onOpen();
    }, 250);
  }

  function handleDoubleClick(e: MouseEvent) {
    e.preventDefault();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setEditing(true);
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-base leading-snug outline-none border-b border-[var(--accent)]"
          placeholder="Untitled"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-md px-2 py-2.5 text-left hover:bg-[var(--hover)] transition-colors"
    >
      <span className="min-w-0 flex-1 text-base leading-snug">{title}</span>
      {childCount > 0 && (
        <span className="shrink-0 rounded-full bg-[var(--badge)] px-2 py-0.5 text-xs tabular-nums text-[var(--muted)]">
          {childCount}
        </span>
      )}
    </button>
  );
}

/** Focus title: single-click toggles details, double-click edits. Chevron at end of text. */
function FocusTitle({
  value,
  detailsOpen,
  onToggleDetails,
  onSave,
}: {
  value: string;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  function commit() {
    const next = draft.trim() || "Untitled";
    setEditing(false);
    if (next !== value) onSave(next);
    else setDraft(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  function handleClick() {
    if (editing) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    // Wait so a double-click can cancel the toggle
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onToggleDetails();
    }, 250);
  }

  function handleDoubleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setEditing(true);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-2xl font-semibold tracking-tight leading-snug outline-none border-b border-[var(--accent)]"
        placeholder="Untitled"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="w-full rounded-sm text-left text-2xl font-semibold tracking-tight leading-snug hover:bg-[var(--hover)] -mx-1 px-1 transition-colors"
      aria-expanded={detailsOpen}
    >
      <span>{value || "Untitled"}</span>
      <span
        aria-hidden="true"
        className="ml-1.5 inline-block align-middle text-sm font-normal text-[var(--muted)]"
      >
        {detailsOpen ? "▾" : "▸"}
      </span>
    </button>
  );
}

function MetaRow({
  label,
  children,
  layout = "stack",
}: {
  label: string;
  children: React.ReactNode;
  /** stack = label above (notes); inline = label beside value (short fields) */
  layout?: "stack" | "inline";
}) {
  if (layout === "inline") {
    return (
      <div className="flex items-baseline gap-3">
        <div className="w-14 shrink-0 text-[11px] uppercase tracking-wider text-[var(--faint)]">
          {label}
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-wider text-[var(--faint)]">
        {label}
      </div>
      {children}
    </div>
  );
}
