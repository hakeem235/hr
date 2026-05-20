/**
 * Letter renderer — public API.
 *
 * Usage:
 *   const pdf = await renderLetter({ letter, employee, entity });
 *   reply.type('application/pdf').send(pdf);
 */

import type { LetterRecord, LetterLanguage } from '../domain/letter.js';
import { getTemplate, type RenderContext } from './templates.js';
import { renderToPdf } from './pdf-renderer.js';

export type { LetterContent, RenderContext, LetterTemplate } from './templates.js';
export { getTemplate } from './templates.js';
export { renderToPdf } from './pdf-renderer.js';

// ─── Employee + entity data ───────────────────────────────────────────────────

export interface EmployeeData {
  nameEn: string;
  nameAr: string;
  positionEn: string;
  positionAr: string;
  departmentEn: string;
  departmentAr: string;
  /** ISO date string, e.g. "2022-03-01" */
  joinDate: string;
  /** Integer halalas — 1 SAR = 100 halalas */
  basicSalaryHalala: number;
  nationality: string;
  nationalityAr: string;
  /** Iqama number (expats) or national ID (Saudis) */
  idNumber?: string;
}

export interface EntityData {
  nameEn: string;
  nameAr: string;
  crNumber: string;
}

export interface LetterRenderInput {
  letter: LetterRecord;
  employee: EmployeeData;
  entity: EntityData;
  /** Optional path to Arabic TTF/OTF font file for correct Arabic shaping. */
  arabicFontPath?: string;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function renderLetter(input: LetterRenderInput): Promise<Buffer> {
  const { letter, employee, entity, arabicFontPath } = input;
  const template = getTemplate(letter.letterTypeId);
  const ctx = buildContext(letter, employee, entity);

  return renderToPdf({ template, ctx, language: letter.language as LetterLanguage, arabicFontPath });
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(
  letter: LetterRecord,
  emp: EmployeeData,
  entity: EntityData,
): RenderContext {
  const seq = letter.id.replace('ltr_', '').toUpperCase();
  const year = new Date(letter.createdAt).getFullYear();

  return {
    nameEn: emp.nameEn,
    nameAr: emp.nameAr,
    positionEn: emp.positionEn,
    positionAr: emp.positionAr,
    departmentEn: emp.departmentEn,
    departmentAr: emp.departmentAr,
    entityNameEn: entity.nameEn,
    entityNameAr: entity.nameAr,
    joinDateFormatted: formatDate(emp.joinDate),
    salaryFormatted: formatSalary(emp.basicSalaryHalala),
    nationality: emp.nationality,
    nationalityAr: emp.nationalityAr,
    idNumber: emp.idNumber ?? '',
    refNumber: `LTR-${year}-${seq}`,
    issuedDate: formatDate(letter.updatedAt),
    purpose: letter.purpose,
    recipientName: letter.recipientName,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Riyadh',
  });
}

/** Halalas (integer) → "SAR 12,500.00" */
function formatSalary(halala: number): string {
  const sar = halala / 100;
  return `SAR ${sar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
