import { proxyToLegacySite } from "@/lib/legacy-proxy";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyToLegacySite(request, path, "/user-profile");
}
