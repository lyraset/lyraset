import { z } from 'zod';
import Project from '@/models/workspace/Project';
import { settingsCollection, baseTransform } from '@/lib/workspace/services/settings';
import { api } from '@/lib/workspace/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  name: z.string().trim().min(2, 'Give the project a name.').max(120),
  client: z.string().trim().max(120).nullish(),
  active: z.boolean().default(true),
});

const handlers = settingsCollection({
  model: Project,
  name: 'projects',
  schema: Schema,
  sort: { client: 1, name: 1 },
  transform: baseTransform,
});

export const GET = api(handlers.GET);
export const POST = api(handlers.POST);
export const PATCH = api(handlers.PATCH);
export const DELETE = api(handlers.DELETE);
