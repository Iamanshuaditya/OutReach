import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import { runSegmentation } from "@/lib/icp-engine/segmenter";
import { z } from "zod";
import { formatZodError } from "@/lib/validation";

export const maxDuration = 300; // 5 minutes for large datasets

const segmentSchema = z.object({
  source_tables: z.array(z.string().trim().min(1)).min(1),
  icp_ids: z.array(z.string().uuid()).optional(),
});

// POST /api/icp/segment — Run segmentation across source tables
export async function POST(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) return auth.response;

  const { orgId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = segmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  try {
    const stats = await runSegmentation(
      orgId,
      parsed.data.source_tables,
      parsed.data.icp_ids
    );

    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Segmentation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
