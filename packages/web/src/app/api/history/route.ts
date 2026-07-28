import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { getChatHistory } from "../../../lib/chatHistory";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await getChatHistory(session.user.id);
  return NextResponse.json(history);
}
