import { z } from 'zod';
import Shift from '@/models/workspace/Shift';
import { settingsCollection, baseTransform } from '@/lib/workspace/services/settings';
import { api } from '@/lib/workspace/route';
import { timeString } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DaySchema = z
  .object({
    working: z.boolean().default(false),
    start: timeString.nullish(),
    end: timeString.nullish(),
    breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
  })
  .superRefine((day, ctx) => {
    // A working day without times would silently require zero minutes.
    if (day.working && (!day.start || !day.end)) {
      ctx.addIssue({ code: 'custom', message: 'Give a start and end time for a working day.' });
    }
  });

const Schema = z.object({
  name: z.string().trim().min(2, 'Give the shift a name.').max(80),
  days: z.object({
    mon: DaySchema,
    tue: DaySchema,
    wed: DaySchema,
    thu: DaySchema,
    fri: DaySchema,
    sat: DaySchema,
    sun: DaySchema,
  }),
  graceMinutes: z.coerce.number().int().min(0).max(240).default(15),
  flexible: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

const handlers = settingsCollection({
  model: Shift,
  name: 'shifts',
  schema: Schema,
  transform: baseTransform,
});

export const GET = api(handlers.GET);
export const POST = api(handlers.POST);
export const PATCH = api(handlers.PATCH);
export const DELETE = api(handlers.DELETE);
