/**
 * Tests for the letter template renderer and PDF generation.
 * PDF content is validated structurally — we check the buffer starts with
 * %PDF (valid PDF header) and that templates produce the expected text content.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplate } from '../src/renderer/index.js';
import { renderToPdf } from '../src/renderer/pdf-renderer.js';
// ─── Fixture ──────────────────────────────────────────────────────────────────
const ctx = {
    nameEn: 'Ahmed Hassan',
    nameAr: 'أحمد حسن',
    positionEn: 'Product Manager',
    positionAr: 'مدير المنتج',
    departmentEn: 'Product',
    departmentAr: 'المنتج',
    entityNameEn: 'TechCorp Arabia Ltd.',
    entityNameAr: 'شركة تك كورب العربية المحدودة',
    joinDateFormatted: '15 September 2022',
    salaryFormatted: 'SAR 18,000.00',
    nationality: 'Egyptian',
    nationalityAr: 'مصري',
    idNumber: '2143865219',
    refNumber: 'LTR-2026-004A11',
    issuedDate: '20 May 2026',
    purpose: 'travel visa application',
    recipientName: 'French Embassy',
};
// ─── Template content tests ───────────────────────────────────────────────────
test('salary_certificate EN template includes employee name and salary', () => {
    const t = getTemplate('salary_certificate');
    const content = t.en(ctx);
    assert.ok(content.paragraphs.some((p) => p.includes('Ahmed Hassan')));
    assert.ok(content.paragraphs.some((p) => p.includes('SAR 18,000.00')));
    assert.equal(content.subject, 'Salary Certificate');
});
test('salary_certificate AR template includes Arabic name', () => {
    const t = getTemplate('salary_certificate');
    const content = t.ar(ctx);
    assert.ok(content.paragraphs.some((p) => p.includes('أحمد حسن')));
    assert.equal(content.subject, 'شهادة راتب');
});
test('noc template uses recipientName in salutation', () => {
    const t = getTemplate('noc');
    const en = t.en(ctx);
    assert.ok(en.salutation.includes('French Embassy'));
    const ctxNoRecipient = { ...ctx, recipientName: undefined };
    const enGeneric = t.en(ctxNoRecipient);
    assert.ok(enGeneric.salutation.includes('To Whom'));
});
test('getTemplate returns all 7 KSA letter types with at least one language', () => {
    const types = [
        'salary_certificate', 'employment_certificate', 'experience_letter',
        'noc', 'bank_letter', 'embassy_letter', 'salary_transfer',
    ];
    for (const typeId of types) {
        const t = getTemplate(typeId);
        assert.ok(t.en || t.ar, `${typeId} must have at least one language template`);
    }
});
test('getTemplate returns fallback for unknown type', () => {
    const t = getTemplate('unknown_type_xyz');
    assert.ok(t.en, 'fallback should have en template');
    const content = t.en(ctx);
    assert.ok(content.paragraphs.length > 0);
});
test('salary_transfer only has AR template', () => {
    const t = getTemplate('salary_transfer');
    assert.ok(t.ar, 'salary_transfer must have ar template');
    // AR template includes salary amount
    const content = t.ar(ctx);
    assert.ok(content.paragraphs.some((p) => p.includes('SAR 18,000.00')));
});
test('bank_letter AR template includes structured employee details', () => {
    const t = getTemplate('bank_letter');
    const content = t.ar(ctx);
    assert.ok(content.paragraphs.some((p) => p.includes('أحمد حسن')));
    assert.ok(content.paragraphs.some((p) => p.includes('SAR 18,000.00')));
});
// ─── PDF generation tests ─────────────────────────────────────────────────────
test('renderToPdf produces a valid PDF buffer for EN letter', async () => {
    const t = getTemplate('employment_certificate');
    const buf = await renderToPdf({ template: t, ctx, language: 'en' });
    assert.ok(Buffer.isBuffer(buf), 'result should be a Buffer');
    assert.ok(buf.length > 1024, 'PDF should be larger than 1 KB');
    // Valid PDF starts with %PDF
    assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF');
});
test('renderToPdf produces a valid PDF buffer for AR letter', async () => {
    const t = getTemplate('salary_certificate');
    const buf = await renderToPdf({ template: t, ctx, language: 'ar' });
    assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF');
});
test('renderToPdf produces a valid PDF buffer for bilingual letter', async () => {
    const t = getTemplate('noc');
    const buf = await renderToPdf({ template: t, ctx, language: 'bilingual' });
    assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF');
    // Bilingual PDF should be larger than single-language
    const enBuf = await renderToPdf({ template: t, ctx, language: 'en' });
    assert.ok(buf.length > enBuf.length, 'bilingual PDF should be larger than EN-only');
});
test('renderToPdf embeds refNumber in PDF metadata title', async () => {
    const t = getTemplate('salary_certificate');
    const buf = await renderToPdf({ template: t, ctx, language: 'en' });
    // PDF string objects are encoded as (text) — check ref number appears in raw bytes
    assert.ok(buf.toString('latin1').includes(ctx.refNumber));
});
test('renderToPdf handles missing arabic font gracefully', async () => {
    const t = getTemplate('salary_certificate');
    // Non-existent font path — should fall back to Helvetica without throwing
    const buf = await renderToPdf({
        template: t, ctx, language: 'bilingual',
        arabicFontPath: '/nonexistent/path/arabic.ttf',
    });
    assert.equal(buf.slice(0, 4).toString('ascii'), '%PDF');
});
