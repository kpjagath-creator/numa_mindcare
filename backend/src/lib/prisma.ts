// Singleton PrismaClient instance shared across the entire application.
// Prevents multiple client instances from being created during hot-reload in dev.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

export default prisma;
