import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { toggleLike } from "@/lib/setlist-cache";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const liked = await toggleLike(id, session.user.email);
    return Response.json({ liked });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
