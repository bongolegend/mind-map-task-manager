import { promises as fs } from "fs";
import path from "path";
import { createSeedStore } from "./seed";
import type { Entity, EntityType, Store } from "./types";
import { ROOT_ID } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(
      STORE_PATH,
      JSON.stringify(createSeedStore(), null, 2),
      "utf8",
    );
  }
}

export async function readStore(): Promise<Store> {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as Store;
}

export async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function newId(type: EntityType): string {
  return `${type}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function updateEntity(
  id: string,
  patch: Partial<Omit<Entity, "id" | "type">>,
): Promise<Entity> {
  const store = await readStore();
  const entity = store.entities[id];
  if (!entity) throw new Error(`Entity not found: ${id}`);

  const updated: Entity = { ...entity, ...patch, id: entity.id, type: entity.type };

  // Empty strings clear optional scalar fields (date inputs send "" when cleared)
  const clearable = new Set([
    "dueDate",
    "date",
    "notes",
    "role",
    "firm",
    "status",
  ]);
  for (const [key, value] of Object.entries(patch)) {
    if (clearable.has(key) && (value === "" || value === undefined)) {
      delete updated[key as keyof Entity];
    }
  }

  store.entities[id] = updated;
  await writeStore(store);
  return updated;
}

export async function createChild(params: {
  parentId: string;
  type: EntityType;
  title?: string;
}): Promise<{ entity: Entity; store: Store }> {
  const store = await readStore();
  const parent = store.entities[params.parentId];
  if (!parent) throw new Error(`Parent not found: ${params.parentId}`);

  const id = newId(params.type);
  const defaultTitle =
    params.title?.trim() ||
    `New ${params.type.charAt(0).toUpperCase()}${params.type.slice(1)}`;

  const entity: Entity = {
    id,
    type: params.type,
    title: defaultTitle,
    ...(params.type === "task" ? { status: "todo" as const } : {}),
    ...(params.type === "interaction"
      ? { date: new Date().toISOString().slice(0, 10) }
      : {}),
  };

  store.entities[id] = entity;
  store.children[id] = store.children[id] ?? [];

  if (params.type === "person" && parent.type === "bet") {
    const list = store.betPeople[parent.id] ?? [];
    store.betPeople[parent.id] = [...list, id];
  } else {
    const list = store.children[parent.id] ?? [];
    store.children[parent.id] = [...list, id];
  }

  await writeStore(store);
  return { entity, store };
}

export function getChildIds(store: Store, focusId: string): string[] {
  const focus = store.entities[focusId];
  if (!focus) return [];

  if (focus.type === "bet") {
    const tasks = (store.children[focusId] ?? []).filter(
      (id) => store.entities[id]?.type === "task",
    );
    const people = store.betPeople[focusId] ?? [];
    return [...tasks, ...people];
  }

  return store.children[focusId] ?? [];
}

export function childCount(store: Store, id: string): number {
  return getChildIds(store, id).length;
}

/** Collect tree-owned descendants (children map only — not bet↔person links). */
function collectOwnedDescendants(store: Store, id: string, into: Set<string>) {
  into.add(id);
  for (const childId of store.children[id] ?? []) {
    if (!into.has(childId)) {
      collectOwnedDescendants(store, childId, into);
    }
  }
}

/**
 * Delete an entity and its tree-owned descendants.
 * People linked to a deleted bet are unlinked, not deleted.
 * Deleting a person removes them from all bets and deletes their interactions.
 */
export async function deleteEntity(id: string): Promise<Store> {
  if (id === ROOT_ID) {
    throw new Error("Cannot delete the workspace root");
  }

  const store = await readStore();
  const entity = store.entities[id];
  if (!entity) throw new Error(`Entity not found: ${id}`);

  const toRemove = new Set<string>();
  collectOwnedDescendants(store, id, toRemove);

  for (const removeId of toRemove) {
    delete store.entities[removeId];
    delete store.children[removeId];
    delete store.betPeople[removeId];
  }

  // Drop removed ids from every parent's children list
  for (const parentId of Object.keys(store.children)) {
    store.children[parentId] = (store.children[parentId] ?? []).filter(
      (childId) => !toRemove.has(childId),
    );
  }

  // Drop removed people (or any id) from bet↔person links
  for (const betId of Object.keys(store.betPeople)) {
    store.betPeople[betId] = (store.betPeople[betId] ?? []).filter(
      (personId) => !toRemove.has(personId),
    );
    if (store.betPeople[betId].length === 0) {
      delete store.betPeople[betId];
    }
  }

  await writeStore(store);
  return store;
}
