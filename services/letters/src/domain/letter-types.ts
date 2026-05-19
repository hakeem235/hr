/**
 * KSA HR letter types — config-as-data, HR-editable without a deploy.
 * Mirrors leave-types.ts pattern.
 */

export interface LetterType {
  id: string;
  entityId: string;
  nameEn: string;
  nameAr: string;
  /** Whether manager approval is required (most letters need HR only). */
  requiresManagerApproval: boolean;
  /** Default language if not overridden by the requester. */
  defaultLanguage: 'en' | 'ar' | 'bilingual';
  /** Which purposes are pre-approved for this type (empty = all allowed). */
  allowedPurposes: string[];
  /** Whether the employee must still be employed to request. */
  requiresActiveEmployment: boolean;
}

export interface LetterPolicy {
  letterTypeId: string;
  /** Max requests per employee per year (0 = unlimited). */
  maxPerYear: number;
  /** SLA for generation after approval in business hours. */
  generationSlaHours: number;
  /** Languages available for this letter type. */
  availableLanguages: ('en' | 'ar' | 'bilingual')[];
}

// ─── KSA standard HR letter types ────────────────────────────────────────────

const LETTER_TYPES: LetterType[] = [
  {
    id: 'salary_certificate',
    entityId: 'ent_default',
    nameEn: 'Salary Certificate',
    nameAr: 'شهادة راتب',
    requiresManagerApproval: false,
    defaultLanguage: 'bilingual',
    allowedPurposes: [],
    requiresActiveEmployment: true,
  },
  {
    id: 'employment_certificate',
    entityId: 'ent_default',
    nameEn: 'Employment Certificate',
    nameAr: 'شهادة عمل',
    requiresManagerApproval: false,
    defaultLanguage: 'bilingual',
    allowedPurposes: [],
    requiresActiveEmployment: true,
  },
  {
    id: 'experience_letter',
    entityId: 'ent_default',
    nameEn: 'Experience Letter',
    nameAr: 'خطاب خبرة',
    requiresManagerApproval: true,
    defaultLanguage: 'en',
    allowedPurposes: [],
    // Can be requested after termination
    requiresActiveEmployment: false,
  },
  {
    id: 'noc',
    entityId: 'ent_default',
    nameEn: 'No Objection Certificate (NOC)',
    nameAr: 'شهادة عدم ممانعة',
    requiresManagerApproval: true,
    defaultLanguage: 'bilingual',
    allowedPurposes: ['travel', 'visa', 'second_job', 'study', 'other'],
    requiresActiveEmployment: true,
  },
  {
    id: 'bank_letter',
    entityId: 'ent_default',
    nameEn: 'Bank Letter',
    nameAr: 'خطاب بنكي',
    requiresManagerApproval: false,
    defaultLanguage: 'ar',
    allowedPurposes: [],
    requiresActiveEmployment: true,
  },
  {
    id: 'embassy_letter',
    entityId: 'ent_default',
    nameEn: 'Embassy / Consulate Letter',
    nameAr: 'خطاب سفارة',
    requiresManagerApproval: false,
    defaultLanguage: 'en',
    allowedPurposes: [],
    requiresActiveEmployment: true,
  },
  {
    id: 'salary_transfer',
    entityId: 'ent_default',
    nameEn: 'Salary Transfer Letter',
    nameAr: 'خطاب تحويل راتب',
    requiresManagerApproval: false,
    defaultLanguage: 'ar',
    allowedPurposes: [],
    requiresActiveEmployment: true,
  },
];

const LETTER_POLICIES: LetterPolicy[] = [
  { letterTypeId: 'salary_certificate',   maxPerYear: 0,  generationSlaHours: 4,  availableLanguages: ['en', 'ar', 'bilingual'] },
  { letterTypeId: 'employment_certificate',maxPerYear: 0, generationSlaHours: 4,  availableLanguages: ['en', 'ar', 'bilingual'] },
  { letterTypeId: 'experience_letter',    maxPerYear: 1,  generationSlaHours: 8,  availableLanguages: ['en', 'ar'] },
  { letterTypeId: 'noc',                  maxPerYear: 2,  generationSlaHours: 4,  availableLanguages: ['en', 'ar', 'bilingual'] },
  { letterTypeId: 'bank_letter',          maxPerYear: 0,  generationSlaHours: 4,  availableLanguages: ['ar', 'bilingual'] },
  { letterTypeId: 'embassy_letter',       maxPerYear: 0,  generationSlaHours: 4,  availableLanguages: ['en', 'bilingual'] },
  { letterTypeId: 'salary_transfer',      maxPerYear: 1,  generationSlaHours: 4,  availableLanguages: ['ar'] },
];

export function getLetterTypes(entityId: string): LetterType[] {
  return LETTER_TYPES.filter((t) => t.entityId === entityId || t.entityId === 'ent_default');
}

export function getLetterType(typeId: string): LetterType | undefined {
  return LETTER_TYPES.find((t) => t.id === typeId);
}

export function getLetterPolicy(typeId: string): LetterPolicy | undefined {
  return LETTER_POLICIES.find((p) => p.letterTypeId === typeId);
}
