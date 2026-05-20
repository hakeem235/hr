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
import type { RenderContext, LetterTemplate } from './templates.js';
import type { LetterLanguage } from '../domain/letter.js';
export interface PdfRenderInput {
    template: LetterTemplate;
    ctx: RenderContext;
    language: LetterLanguage;
    /** Path to Arabic TTF/OTF font file (optional — see module docstring). */
    arabicFontPath?: string;
}
export declare function renderToPdf(input: PdfRenderInput): Promise<Buffer>;
