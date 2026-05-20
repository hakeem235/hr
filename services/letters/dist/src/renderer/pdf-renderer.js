/**
 * PDF layout engine using PDFKit.
 *
 * Arabic font requirement:
 *   Set ARABIC_FONT_PATH env var to an OTF/TTF file with full Arabic glyph
 *   coverage and OpenType shaping (Amiri, NotoNaskhArabic, etc.).
 *   Without it the renderer falls back to Helvetica — English letters render
 *   correctly; Arabic characters appear as isolated glyphs.
 *
 * Accessibility: PDFKit embeds real text (not images), satisfying the
 * WCAG 2.2 AA "tagged PDF with text layer" requirement (CLAUDE.md §10).
 */
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
// CJS interop — pdfkit ships as CommonJS
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');
// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_W = 595.28; // A4 width in points
const PAGE_H = 841.89; // A4 height in points
const ML = 72; // left margin
const MR = 72; // right margin
const MT = 72; // top margin
const MB = 72; // bottom margin
const CW = PAGE_W - ML - MR; // content width
const TEAL = '#1d6b6b';
const DARK = '#1a1a1a';
const SUBTLE = '#6b7280';
const RULE = '#d1d5db';
export async function renderToPdf(input) {
    const { template, ctx, language, arabicFontPath } = input;
    const hasArabicFont = !!(arabicFontPath && await canRead(arabicFontPath));
    const arFont = hasArabicFont ? 'Arabic' : 'Helvetica';
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: MT, bottom: MB, left: ML, right: MR },
            info: {
                Title: ctx.refNumber,
                Author: ctx.entityNameEn,
                Creator: 'HR Platform Letters Service',
                Subject: language === 'ar'
                    ? ctx.refNumber
                    : `${ctx.refNumber} — ${template.en?.(ctx).subject ?? ''}`,
            },
        });
        if (hasArabicFont) {
            doc.registerFont('Arabic', arabicFontPath);
        }
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        buildLetter(doc, template, ctx, language, arFont);
        doc.end();
    });
}
// ─── Layout ───────────────────────────────────────────────────────────────────
function buildLetter(doc, template, ctx, language, arFont) {
    drawHeader(doc, ctx, language, arFont);
    drawRefDateLine(doc, ctx);
    if (language === 'bilingual') {
        if (template.en)
            drawSection(doc, template.en(ctx), 'en', 'Helvetica');
        drawHRule(doc);
        if (template.ar)
            drawSection(doc, template.ar(ctx), 'ar', arFont);
    }
    else if (language === 'ar') {
        if (template.ar)
            drawSection(doc, template.ar(ctx), 'ar', arFont);
        else if (template.en)
            drawSection(doc, template.en(ctx), 'en', 'Helvetica');
    }
    else {
        if (template.en)
            drawSection(doc, template.en(ctx), 'en', 'Helvetica');
    }
    drawFooter(doc, ctx);
}
// ─── Header ───────────────────────────────────────────────────────────────────
function drawHeader(doc, ctx, language, arFont) {
    doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(TEAL)
        .text(ctx.entityNameEn, ML, MT, { width: CW, align: 'center' });
    if (language !== 'en') {
        doc.font(arFont).fontSize(13).fillColor(TEAL)
            .text(ctx.entityNameAr, { width: CW, align: 'center' });
    }
    doc.moveDown(0.5);
    hline(doc, doc.y, 1.5, TEAL);
    doc.moveDown(1);
}
// ─── Reference + date line ────────────────────────────────────────────────────
function drawRefDateLine(doc, ctx) {
    const y = doc.y;
    doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(SUBTLE)
        .text(`Ref: ${ctx.refNumber}`, ML, y, { width: CW / 2, align: 'left', lineBreak: false });
    doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(SUBTLE)
        .text(`Date: ${ctx.issuedDate}`, ML + CW / 2, y, { width: CW / 2, align: 'right' });
    doc.moveDown(1.5);
}
// ─── Section (one language) ───────────────────────────────────────────────────
function drawSection(doc, content, lang, font) {
    const rtl = lang === 'ar';
    const align = rtl ? 'right' : 'left';
    const opts = { width: CW, align };
    // Subject
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEAL)
        .text(content.subject, ML, doc.y, opts);
    doc.moveDown(0.8);
    // Salutation
    doc.font(font).fontSize(10).fillColor(DARK)
        .text(content.salutation, ML, doc.y, opts);
    doc.moveDown(0.6);
    // Body
    for (const para of content.paragraphs) {
        doc.font(font).fontSize(10).fillColor(DARK)
            .text(para, ML, doc.y, { ...opts, lineGap: 2 });
        doc.moveDown(0.6);
    }
    // Closing + signature block
    doc.moveDown(0.4);
    doc.font(font).fontSize(10).fillColor(DARK)
        .text(content.closing, ML, doc.y, opts);
    doc.moveDown(2.5);
    // Signature line
    const sigLineX = rtl ? ML + CW - 140 : ML;
    doc.moveTo(sigLineX, doc.y).lineTo(sigLineX + 140, doc.y)
        .lineWidth(0.75).strokeColor(DARK).stroke();
    doc.moveDown(0.4);
    doc.font(font).fontSize(10).fillColor(DARK)
        .text(content.signatory, ML, doc.y, opts);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor(SUBTLE)
        .text(content.subject, ML, doc.y, opts);
    doc.moveDown(1);
}
// ─── Bilingual separator ──────────────────────────────────────────────────────
function drawHRule(doc) {
    doc.moveDown(0.5);
    hline(doc, doc.y, 0.5, RULE);
    doc.moveDown(1);
}
// ─── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(doc, ctx) {
    // Pin footer near the bottom of the current page
    const footerY = PAGE_H - MB + 10;
    hline(doc, footerY - 6, 0.5, RULE);
    doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(SUBTLE)
        .text(`${ctx.entityNameEn}  ·  This is a computer-generated document and is valid without a physical signature.`, ML, footerY, { width: CW, align: 'center' });
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function hline(doc, y, w, color) {
    doc.moveTo(ML, y).lineTo(PAGE_W - MR, y).lineWidth(w).strokeColor(color).stroke();
}
async function canRead(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
