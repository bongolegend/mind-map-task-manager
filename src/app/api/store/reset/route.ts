import { NextResponse } from "next/server";
import { writeStore } from "@/lib/store";
import { createSeedStore } from "@/lib/seed";

/** Reset file store to seed — used by e2e tests. */
export async function POST() {
  const store = createSeedStore();
  await writeStore(store);
  return NextResponse.json({ store });
}
