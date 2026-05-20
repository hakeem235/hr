/**
 * Core types for /services/benefits.
 * Covers KSA HR benefit categories: medical insurance (CCHI), life insurance,
 * End of Service Gratuity (EOSB), air ticket, education allowance, mobile allowance.
 */
export type BenefitCategory = 'medical_insurance' | 'life_insurance' | 'eosb' | 'air_ticket' | 'education_allowance' | 'mobile_allowance' | 'other';
export type MedicalTier = 'basic' | 'enhanced' | 'executive';
export interface BenefitPlan {
    id: string;
    entityId: string;
    nameEn: string;
    nameAr: string;
    category: BenefitCategory;
    /** Medical insurance specific — CCHI provider code. */
    cchiProviderCode?: string;
    /** Medical insurance tier. */
    medicalTier?: MedicalTier;
    /** Whether family dependents can be added. */
    allowsDependents: boolean;
    /** Max number of dependents allowed (0 = unlimited). */
    maxDependents: number;
    /** Whether the employee is eligible based on nationality (empty = all). */
    eligibleNationalities: string[];
    /** Grade codes eligible for this plan (empty = all). */
    eligibleGrades: string[];
    /** Employee contribution per month in minor units (halalas). */
    employeeContributionMinor: number;
    /** Employer contribution per month in minor units. */
    employerContributionMinor: number;
    currency: string;
    isActive: boolean;
    createdAt: string;
    version: number;
}
export type EnrollmentStatus = 'pending' | 'active' | 'suspended' | 'terminated';
export interface Dependent {
    id: string;
    enrollmentId: string;
    nameEn: string;
    nameAr?: string;
    relationship: 'spouse' | 'child' | 'parent';
    dateOfBirth: string;
    nationalId?: string;
    addedAt: string;
}
export interface EnrollmentRecord {
    id: string;
    entityId: string;
    employeeId: string;
    planId: string;
    status: EnrollmentStatus;
    effectiveFrom: string;
    effectiveTo?: string;
    dependents: Dependent[];
    idempotencyKey: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}
/**
 * End of Service Gratuity calculation result per KSA Labour Law Art. 84.
 * Stored as minor units (halalas) — never floats.
 */
export interface EosbCalculation {
    employeeId: string;
    hireDate: string;
    exitDate: string;
    yearsOfService: number;
    fractionalYears: number;
    /** Last basic salary in minor units. */
    lastBasicMinor: number;
    /** Total EOSB entitlement in minor units. */
    totalEosbMinor: number;
    /** Breakdown by tier. */
    breakdown: EosbTier[];
    calculatedAt: string;
}
export interface EosbTier {
    label: string;
    years: number;
    multiplier: number;
    amountMinor: number;
}
export interface DomainEvent {
    eventId: string;
    eventType: string;
    entityId: string;
    correlationId: string;
    occurredAt: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
}
export interface EnrollmentFilter {
    employeeId?: string;
    entityId?: string;
    planId?: string;
    status?: EnrollmentStatus;
    cursor?: string;
    limit: number;
}
export interface BenefitRepo {
    findPlanById(id: string): Promise<BenefitPlan | null>;
    listPlans(entityId: string): Promise<BenefitPlan[]>;
    savePlan(plan: BenefitPlan, event: DomainEvent): Promise<void>;
    findEnrollmentById(id: string): Promise<EnrollmentRecord | null>;
    findEnrollmentByIdempotencyKey(key: string): Promise<EnrollmentRecord | null>;
    findActiveEnrollment(employeeId: string, planId: string): Promise<EnrollmentRecord | null>;
    listEnrollments(filter: EnrollmentFilter): Promise<{
        items: EnrollmentRecord[];
        nextCursor?: string;
    }>;
    saveWithEvent(rec: EnrollmentRecord, event: DomainEvent): Promise<void>;
    updateStatus(id: string, status: EnrollmentStatus, effectiveTo: string | undefined, expectedVersion: number, event: DomainEvent): Promise<EnrollmentRecord>;
    addDependent(enrollmentId: string, dependent: Dependent): Promise<EnrollmentRecord>;
    removeDependent(enrollmentId: string, dependentId: string): Promise<EnrollmentRecord>;
}
