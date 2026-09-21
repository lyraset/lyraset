import { z } from 'zod';
import SpecialSchedule from '@/models/workspace/SpecialSchedule';
import { settingsCollection, baseTransform } from '@/lib/workspace/services/settings';
import { api } from '@/lib/workspace/route';
import { timeString, dateString, office } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Every field is optional: an override changes only what it names. */
const OverrideDaySchema = z.object({
  working: z.boolean().optional(),
  start: timeString.optional(),
  end: timeString.optional(),
  breakMinutes: z.coerce.number().int().min(0).max(720).optional(),
});

const BaseSchema = z.object({
  name: z.string().trim().min(2, 'Name the override, e.g. Ramadan timings.').max(80),
  from: dateString,
  to: dateString,
  offices: z.array(office).default([]),
  days: z
    .object({
      mon: OverrideDaySchema.optional(),
      tue: OverrideDaySchema.optional(),
      wed: OverrideDaySchema.optional(),
      thu: OverrideDaySchema.optional(),
      fri: OverrideDaySchema.optional(),
      sat: OverrideDaySchema.optional(),
      sun: OverrideDaySchema.optional(),
    })
    .default({}),
  graceMinutes: z.coerce.number().int().min(0).max(240).optional(),
  flexible: z.boolean().optional(),
  note: z.string().trim().max(400).nullish(),
  active: z.boolean().default(true),
});

/** The date pair only makes sense checked together, so it is refined here. */
const withRange = (schema) =>
  schema.superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The end date cannot be before the start date.',
      });
    }
  });

const Schema = withRange(BaseSchema);
const PatchSchema = withRange(BaseSchema.partial());

const handlers = settingsCollection({
  model: SpecialSchedule,
  name: 'schedules',
  schema: Schema,
  patchSchema: PatchSchema,
  sort: { from: -1 },
  transform: baseTransform,
});

export const GET = api(handlers.GET);
export const POST = api(handlers.POST);
export const PATCH = api(handlers.PATCH);
export const DELETE = api(handlers.DELETE);
