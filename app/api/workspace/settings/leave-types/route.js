import { z } from 'zod';
import LeaveType from '@/models/workspace/LeaveType';
import { settingsCollection, baseTransform } from '@/lib/workspace/services/settings';
import { api } from '@/lib/workspace/route';
import { office } from '@/lib/workspace/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Schema = z.object({
  name: z.string().trim().min(2, 'Give the leave type a name.').max(60),
  code: z.string().trim().toUpperCase().min(2).max(8),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #3d7bff.')
    .default('#3d7bff'),
  paid: z.boolean().default(true),
  countsTowardQuota: z.boolean().default(true),
  monthlyLimit: z.coerce.number().min(0).max(31).nullish(),
  allowHalfDay: z.boolean().default(true),
  requiresDocument: z.boolean().default(false),
  documentAfterDays: z.coerce.number().int().min(0).max(60).default(0),
  minNoticeDays: z.coerce.number().int().min(0).max(90).default(0),
  // An empty list means the type is offered at every office, which is what
  // lets Pakistan and the UAE keep different entitlements.
  offices: z.array(office).default([]),
  active: z.boolean().default(true),
});

const handlers = settingsCollection({
  model: LeaveType,
  name: 'leaveTypes',
  schema: Schema,
  transform: baseTransform,
});

export const GET = api(handlers.GET);
export const POST = api(handlers.POST);
export const PATCH = api(handlers.PATCH);
export const DELETE = api(handlers.DELETE);
