import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { destinationForProfile } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/", request.url));
  if (!viewer.profile) return NextResponse.redirect(new URL("/pending", request.url));
  return NextResponse.redirect(new URL(destinationForProfile(viewer.profile), request.url));
}
