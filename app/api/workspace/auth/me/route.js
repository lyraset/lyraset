import { NextResponse } from 'next/server';
import { requireApiUser, handleApiError } from '@/lib/workspace/auth';

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
