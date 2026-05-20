/**
 * Letter templates — one function per type per language.
 * Config-driven: each template is pure data (no PDF knowledge here).
 * Adding a new letter type = adding an entry to TEMPLATES.
 */
export interface LetterContent {
    subject: string;
    salutation: string;
    /** Each string renders as its own paragraph. '\n' within a string = line break. */
    paragraphs: string[];
    closing: string;
    signatory: string;
}
/** All data the template functions need — assembled by the renderer before calling. */
export interface RenderContext {
    nameEn: string;
    nameAr: string;
    positionEn: string;
    positionAr: string;
    departmentEn: string;
    departmentAr: string;
    entityNameEn: string;
    entityNameAr: string;
    /** Human-readable, e.g. "1 January 2023" */
    joinDateFormatted: string;
    /** Integer halalas → "SAR 12,500.00" */
    salaryFormatted: string;
    nationality: string;
    nationalityAr: string;
    /** Iqama number or national ID */
    idNumber: string;
    /** e.g. "LTR-2026-000042" */
    refNumber: string;
    /** e.g. "20 May 2026" */
    issuedDate: string;
    purpose: string;
    recipientName?: string;
}
export interface LetterTemplate {
    en?: (ctx: RenderContext) => LetterContent;
    ar?: (ctx: RenderContext) => LetterContent;
}
export declare function getTemplate(typeId: string): LetterTemplate;
