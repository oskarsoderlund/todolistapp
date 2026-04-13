import { NextResponse } from "next/server";
import { getTasks } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filterParam = searchParams.get("filter");
  const filter: "pending" | "completed" | "all" =
    filterParam === "completed" || filterParam === "all" ? filterParam : "pending";

  const tasks = getTasks(filter);
  return NextResponse.json({ tasks });
}
