/**
 * Bootstraps the one real Owner account (the portal can't create Owners).
 *
 *   npx tsx scripts/create-owner.mjs --name "Full Name" --email owner@lyraset.com --employee-id LYR-0001
 *   npx tsx scripts/create-owner.mjs --reset      new password for the existing Owner + sign out everywhere
 *
 * The password is generated and printed once. It is not stored anywhere in plain text.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { parseArgs } from 'node:util';
import { User, OFFICE_TIMEZONES } from './workspace-models.mjs';
import { ROLES } from '../lib/workspace/permissions.js';
import { hashPassword, generatePassword } from '../lib/workspace/passwords.js';

dotenv.config();

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    'employee-id': { type: 'string' },
    office: { type: 'string', default: 'ISLAMABAD' },
    reset: { type: 'boolean', default: false },
  },
});

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  await User.createIndexes();

  const existing = await User.findOne({ role: ROLES.OWNER });
  const password = generatePassword(16);

  if (values.reset) {
    if (!existing) throw new Error('No Owner account exists yet.');
    await User.updateOne(
      { _id: existing._id },
      {
        $set: {
          passwordHash: await hashPassword(password),
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        $inc: { tokenVersion: 1 },
      }
    );
    console.log(`New password for ${existing.email}: ${password}`);
    return;
  }

  if (existing) {
    const hint = existing.isSeedData
      ? " It's the demo Owner — run seed-workspace.mjs --clean first."
      : '';
    throw new Error(`An Owner already exists (${existing.email}).${hint}`);
  }
  if (!values.name || !values.email || !values['employee-id']) {
    throw new Error('Provide --name, --email and --employee-id.');
  }

  const owner = await User.create({
    employeeId: values['employee-id'],
    name: values.name,
    email: values.email,
    passwordHash: await hashPassword(password),
    role: ROLES.OWNER,
    requiresAttendance: true,
    designation: 'Owner',
    department: 'Management',
    office: values.office,
    timezone: OFFICE_TIMEZONES[values.office] ?? 'Asia/Karachi',
    employmentType: 'PERMANENT',
  });

  console.log(`Owner created: ${owner.name} (${owner.employeeId}, ${owner.email})`);
  console.log(`Password (shown once): ${password}`);
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
