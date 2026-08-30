// Server-side admin password reset — for when the admin is locked out and
// there is no other way in (no email-based recovery exists for this MVP).
//
// Run with: npm run reset-admin-password
//
// Never prints or logs the password; only confirms success or failure.

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../auth/password";

const prisma = new PrismaClient();

const ENTER_CODES = [10, 13, 4]; // \n, \r, Ctrl-D
const INTERRUPT_CODE = 3; // Ctrl-C
const BACKSPACE_CODES = [127, 8];

function readHiddenInput(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
    stdin.resume();
    stdin.setEncoding("utf8");
    if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(true);

    let input = "";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (char: string) => {
      const code = char.charCodeAt(0);
      if (ENTER_CODES.includes(code)) {
        cleanup();
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (code === INTERRUPT_CODE) {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Aborted"));
        return;
      }
      if (BACKSPACE_CODES.includes(code)) {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      input += char;
      process.stdout.write("*");
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  console.log("Reset the Numa MindCare admin password.\n");

  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    console.error("No user with username 'admin' found. Run the seed script first: npx ts-node prisma/seed.ts");
    process.exitCode = 1;
    return;
  }

  const password = await readHiddenInput("New password (min 8 characters): ");
  if (password.length < 8) {
    console.error("Password must be at least 8 characters. Nothing was changed.");
    process.exitCode = 1;
    return;
  }

  const confirm = await readHiddenInput("Confirm new password: ");
  if (confirm !== password) {
    console.error("Passwords do not match. Nothing was changed.");
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  console.log("\nAdmin password updated successfully. All existing sessions have been signed out.");
}

main()
  .catch((err) => {
    console.error("Failed to reset password:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
