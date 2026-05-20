/**
 * Letter renderer — public API.
 *
 * Usage:
 *   const pdf = await renderLetter({ letter, employee, entity });
 *   reply.type('application/pdf').send(pdf);
 */
import { getTemplate } from './templates.js';
import { renderToPdf } from './pdf-renderer.js';
export { getTemplate } from './templates.js';
export { renderToPdf } from './pdf-renderer.js';
// ─── Main entry point ─────────────────────────────────────────────────────────
export async function renderLetter(input) {
    const { letter, employee, entity, arabicFontPath } = input;
    const template = getTemplate(letter.letterTypeId);
    const ctx = buildContext(letter, employee, entity);
    return renderToPdf({ template, ctx, language: letter.language, arabicFontPath });
}
// ─── Context builder ──────────────────────────────────────────────────────────
function buildContext(letter, emp, entity) {
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
function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Riyadh',
    });
}
/** Halalas (integer) → "SAR 12,500.00" */
function formatSalary(halala) {
    const sar = halala / 100;
    return `SAR ${sar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
