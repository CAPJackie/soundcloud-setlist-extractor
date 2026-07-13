import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url param" }, { status: 400 });

  const db = await getDb();
  const result = await db.collection("setlists").deleteOne({ url });

  return NextResponse.json({ deleted: result.deletedCount === 1 });
}
