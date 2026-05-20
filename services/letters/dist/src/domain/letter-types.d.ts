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
export declare function getLetterTypes(entityId: string): LetterType[];
export declare function getLetterType(typeId: string): LetterType | undefined;
export declare function getLetterPolicy(typeId: string): LetterPolicy | undefined;
