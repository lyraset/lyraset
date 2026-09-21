import { z } from 'zod';
import Department from '@/models/workspace/Department';
import { settingsCollection, baseTransform } from '@/lib/workspace/services/settings';
import { api } from '@/lib/workspace/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  name: z.string().trim().min(2, 'Give the department a name.').max(80),
  active: z.boolean().default(true),
});

const handlers = settingsCollection({
  model: Department,
  name: 'departments',
  schema: Schema,
  transform: baseTransform,
});

export const GET = api(handlers.GET);
export const POST = api(handlers.POST);
export const PATCH = api(handlers.PATCH);
export const DELETE = api(handlers.DELETE);
