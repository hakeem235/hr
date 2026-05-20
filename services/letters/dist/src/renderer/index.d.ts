/**
 * Letter renderer — public API.
 *
 * Usage:
 *   const pdf = await renderLetter({ letter, employee, entity });
 *   reply.type('application/pdf').send(pdf);
 */
import type { LetterRecord } from '../domain/letter.js';
export type { LetterContent, RenderContext, LetterTemplate } from './templates.js';
export { getTemplate } from './templates.js';
export { renderToPdf } from './pdf-renderer.js';
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
export declare function renderLetter(input: LetterRenderInput): Promise<Buffer>;
