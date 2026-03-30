import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("password123", 10);

  const now = new Date();
  const newId = () => crypto.randomUUID(); // works on modern Node

  const admin = await prisma.user.upsert({
    where: { email: "admin@instaguard.com" },
    update: {},
    create: {
      id: newId(),
      updatedAt: now,
      username: "admin",
      email: "admin@instaguard.com",
      password: hashedPassword,
      role: "ADMIN",
      bio: "System Administrator",
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: "user1@example.com" },
    update: {},
    create: {
      id: newId(),
      updatedAt: now,
      username: "johndoe",
      email: "user1@example.com",
      password: hashedPassword,
      bio: "Photography enthusiast.",
      role: "USER", // optional because you already have @default("USER")
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "user2@example.com" },
    update: {},
    create: {
      id: newId(),
      updatedAt: now,
      username: "janedoe",
      email: "user2@example.com",
      password: hashedPassword,
      bio: "Traveler & Foodie.",
      role: "USER",
    },
  });

  console.log({ admin, user1, user2 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });