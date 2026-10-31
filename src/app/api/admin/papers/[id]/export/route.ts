import { getPaper } from "@/lib/admin/papers";
import { getCurrentUser } from "@/lib/auth";

/** Downloads everything extracted for a paper as JSON, for offline review. */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/papers/[id]/export">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });
  const { id } = await ctx.params;
  const paper = await getPaper(id);
  if (!paper) return Response.json({ error: "Paper not found." }, { status: 404 });
  const name = `${paper.subject}-${paper.year}-${paper.variant}`.replace(/[^A-Za-z0-9-]+/g, "_");
  return new Response(JSON.stringify(paper, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${name}.json"`,
    },
  });
}
