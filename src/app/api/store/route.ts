import { NextResponse } from "next/server";
import {
  createChild,
  deleteEntity,
  readStore,
  updateEntity,
} from "@/lib/store";
import type { EntityType } from "@/lib/types";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store);
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: string };
  if (!body?.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    const store = await deleteEntity(body.id);
    return NextResponse.json({ store });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id: string;
    patch: Record<string, string | undefined>;
  };
  if (!body?.id || !body?.patch) {
    return NextResponse.json({ error: "id and patch required" }, { status: 400 });
  }
  try {
    const entity = await updateEntity(body.id, body.patch);
    const store = await readStore();
    return NextResponse.json({ entity, store });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 404 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    parentId: string;
    type: EntityType;
    title?: string;
  };
  if (!body?.parentId || !body?.type) {
    return NextResponse.json(
      { error: "parentId and type required" },
      { status: 400 },
    );
  }
  try {
    const result = await createChild(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 400 },
    );
  }
}
