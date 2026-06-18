import "dotenv/config";
import { prisma } from "../src/prisma.js";


async function main() {
  console.log("🌱 Starting seed...");


  console.log("\n✅ Seed completed");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
