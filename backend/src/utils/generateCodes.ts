// Utility functions for generating unique, sequential identifiers.
// All generators must be called inside a prisma.$transaction() callback
// to prevent race conditions between concurrent requests.

import { Prisma } from "@prisma/client";

/**
 * Generates the next patient_number as a string.
 * Formula: COUNT(*) of existing patients + 1001  (e.g. first patient = "1001")
 *
 * @param tx - Transactional Prisma client; must be provided by the caller's $transaction
 */
export async function generatePatientNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const count = await tx.patient.count();
  return String(count + 1001);
}

/**
 * Generates the next employee_code as a string.
 * Format: EMP-001, EMP-002, ...  (zero-padded to 3 digits)
 * Formula: 'EMP-' + zero-padded (COUNT(*) + 1)
 *
 * @param tx - Transactional Prisma client; must be provided by the caller's $transaction
 */
export async function generateEmployeeCode(
  tx: Prisma.TransactionClient
): Promise<string> {
  const count = await tx.teamMember.count();
  const padded = String(count + 1).padStart(3, "0");
  return `EMP-${padded}`;
}
