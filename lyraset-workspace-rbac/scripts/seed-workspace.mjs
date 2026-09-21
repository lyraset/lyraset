/**
 * Demo accounts for testing the LYRASET Workspace RBAC.
 *
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs          create / refresh demo accounts
 *   WORKSPACE_ALLOW_SEED=true npx tsx scripts/seed-workspace.mjs --clean  delete every demo account
 *
 * Demo passwords are published in this file — run --clean before real staff go live.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import User, { OFFICE_TIMEZONES } from "../models/workspace/User.js";
import { ROLES, ROLE_LABELS } from "../lib/workspace/permissions.js";
import { hashPassword } from "../lib/workspace/passwords.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DEMO_ACCOUNTS = [
  {
    employeeId: "DEMO-001", name: "Faisal Mehmood", email: "owner@lyraset.test", password: "Demo@Owner2026",
    role: ROLES.OWNER, requiresAttendance: true, designation: "Owner", department: "Management",
    office: "ISLAMABAD", workMode: "OFFICE", employmentType: "PERMANENT",
  },
  {
    employeeId: "DEMO-002", name: "Hamza Qureshi", email: "ceo@lyraset.test", password: "Demo@Ceo2026",
    role: ROLES.CEO, requiresAttendance: false, designation: "Chief Executive Officer", department: "Management",
    office: "ISLAMABAD", workMode: "OFFICE", employmentType: "PERMANENT",
  },
  {
    employeeId: "DEMO-003", name: "Sana Iqbal", email: "md@lyraset.test", password: "Demo@Md2026",
    role: ROLES.MD, requiresAttendance: true, designation: "Managing Director", department: "Management",
    office: "ISLAMABAD", workMode: "OFFICE", employmentType: "PERMANENT",
  },
  {
    employeeId: "DEMO-101", name: "Ali Raza", email: "ali@lyraset.test", password: "Demo@Ali2026",
    role: ROLES.EMPLOYEE, requiresAttendance: true, designation: "Web Developer", department: "Web Development",
    office: "ISLAMABAD", workMode: "OFFICE", employmentType: "PERMANENT",
  },
  {
    employeeId: "DEMO-102", name: "Ayesha Khan", email: "ayesha@lyraset.test", password: "Demo@Ayesha2026",
    role: ROLES.EMPLOYEE, requiresAttendance: true, designation: "Performance Marketing Executive",
    department: "Performance Marketing", office: "ISLAMABAD", workMode: "HYBRID", employmentType: "PERMANENT",
  },
  {
    employeeId: "DEMO-103", name: "Usman Tariq", email: "usman@lyraset.test", password: "Demo@Usman2026",
    role: ROLES.EMPLOYEE, requiresAttendance: true, designation: "SEO Specialist", department: "SEO",
    office: "ISLAMABAD", workMode: "REMOTE", employmentType: "CONTRACT",
  },
  {
    employeeId: "DEMO-104", name: "Mahnoor Siddiqui", email: "mahnoor@lyraset.test", password: "Demo@Mahnoor2026",
    role: ROLES.EMPLOYEE, requiresAttendance: true, designation: "Social Media & Content Executive",
    department: "Content & Social", office: "DUBAI", workMode: "OFFICE", employmentType: "PROBATION",
  },
];

async function main() {
  if (process.env.WORKSPACE_ALLOW_SEED !== "true") {
    console.error("Refusing to run: set WORKSPACE_ALLOW_SEED=true to confirm you want demo accounts in this database.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);
  await User.createIndexes();

  if (process.argv.includes("--clean")) {
    const { deletedCount } = await User.deleteMany({ isSeedData: true });
    console.log(`Removed ${deletedCount} demo account(s).`);
    return;
  }

  const realOwner = await User.findOne({ role: ROLES.OWNER, isSeedData: { $ne: true } }).lean();
  const rows = [];

  for (const { password, ...account } of DEMO_ACCOUNTS) {
    if (account.role === ROLES.OWNER && realOwner) {
      console.warn(`A real Owner (${realOwner.email}) exists, so the demo Owner was skipped.`);
      continue;
    }
    await User.findOneAndUpdate(
      { email: account.email },
      {
        $set: {
          ...account,
          timezone: OFFICE_TIMEZONES[account.office],
          passwordHash: await hashPassword(password),
          joiningDate: new Date("2026-01-01"),
          status: "ACTIVE",
          failedLoginAttempts: 0,
          lockUntil: null,
          isSeedData: true,
        },
        $inc: { tokenVersion: 1 }, // re-seeding signs out old demo sessions
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    rows.push({
      Role: ROLE_LABELS[account.role],
      Name: account.name,
      "Employee ID": account.employeeId,
      Email: account.email,
      Password: password,
    });
  }

  console.table(rows);
  console.log("Sign in at /workspace/login with the Employee ID or email.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
