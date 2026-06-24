import "dotenv/config";
import {
  SuperAdminStatus,
} from "../src/generated/prisma/enums.js";
import { prisma } from "../src/prisma.js";
import { hashPassword } from "../src/utils/password.js";

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME?.trim() || "Super";
  const lastName = process.env.SUPER_ADMIN_LAST_NAME?.trim() || "Operator";

  if (!email || !password) {
    throw new Error(
      "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required.",
    );
  }
  if (password.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  }

  const existing = await prisma.superAdmin.findUnique({
    where: { email },
    select: { email: true },
  });
  if (existing) {
    console.log(`Super-admin already exists: ${existing.email}`);
    return;
  }

  const superAdmin = await prisma.superAdmin.create({
    data: {
      firstName,
      lastName,
      email,
      password: await hashPassword(password),
      status: SuperAdminStatus.ACTIVE,
    },
  });

  console.log(`Seeded super admin: ${superAdmin.email}`);
}

main()
  .catch((error) => {
    console.error("Super-admin seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
