import { NextRequest, NextResponse } from "next/server";
import { createUser } from "../../../lib/users";
import { signupSchema } from "../../../lib/schemas";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const user = await createUser(parsed.data);
    return NextResponse.json(user);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
