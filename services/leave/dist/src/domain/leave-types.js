/**
 * Leave type and policy definitions.
 * In production these are stored in the DB and edited by HR admins.
 * This seed data follows KSA Labour Law minimums.
 */
/** Seed leave types — default KSA entity */
const DEFAULT_ENTITY = 'ent_default';
export const LEAVE_TYPES = [
    {
        id: 'annual',
        entityId: DEFAULT_ENTITY,
        name: 'Annual Leave',
        nameAr: 'إجازة سنوية',
        annualEntitlementDays: 21, // KSA Labour Law art.109: 21 days, 30 after 5 years
        maxDaysPerRequest: 0,
        requiresAttachment: false,
        minNoticeDays: 5,
        carryOver: true,
        paid: true,
    },
    {
        id: 'sick',
        entityId: DEFAULT_ENTITY,
        name: 'Sick Leave',
        nameAr: 'إجازة مرضية',
        annualEntitlementDays: 30, // 30 fully paid per KSA art.117
        maxDaysPerRequest: 30,
        requiresAttachment: true,
        minNoticeDays: 0,
        carryOver: false,
        paid: true,
    },
    {
        id: 'emergency',
        entityId: DEFAULT_ENTITY,
        name: 'Emergency Leave',
        nameAr: 'إجازة طارئة',
        annualEntitlementDays: 5,
        maxDaysPerRequest: 5,
        requiresAttachment: false,
        minNoticeDays: 0,
        carryOver: false,
        paid: true,
    },
    {
        id: 'maternity',
        entityId: DEFAULT_ENTITY,
        name: 'Maternity Leave',
        nameAr: 'إجازة أمومة',
        annualEntitlementDays: 70, // KSA art.151: 10 weeks
        maxDaysPerRequest: 70,
        requiresAttachment: true,
        minNoticeDays: 14,
        carryOver: false,
        paid: true,
    },
    {
        id: 'paternity',
        entityId: DEFAULT_ENTITY,
        name: 'Paternity Leave',
        nameAr: 'إجازة الأبوة',
        annualEntitlementDays: 3, // KSA art.151a
        maxDaysPerRequest: 3,
        requiresAttachment: false,
        minNoticeDays: 0,
        carryOver: false,
        paid: true,
    },
    {
        id: 'hajj',
        entityId: DEFAULT_ENTITY,
        name: 'Hajj Leave',
        nameAr: 'إجازة الحج',
        annualEntitlementDays: 10, // KSA art.114: once per employment
        maxDaysPerRequest: 10,
        requiresAttachment: false,
        minNoticeDays: 30,
        carryOver: false,
        paid: true,
    },
    {
        id: 'unpaid',
        entityId: DEFAULT_ENTITY,
        name: 'Unpaid Leave',
        nameAr: 'إجازة بدون راتب',
        annualEntitlementDays: 0,
        maxDaysPerRequest: 0,
        requiresAttachment: false,
        minNoticeDays: 5,
        carryOver: false,
        paid: false,
    },
];
export const LEAVE_POLICIES = [
    { leaveTypeId: 'annual', entityId: DEFAULT_ENTITY, minServiceMonths: 1, accrualMethod: 'monthly', accrualRatePerMonth: 1.75 },
    { leaveTypeId: 'sick', entityId: DEFAULT_ENTITY, minServiceMonths: 3, accrualMethod: 'annual' },
    { leaveTypeId: 'emergency', entityId: DEFAULT_ENTITY, minServiceMonths: 0, accrualMethod: 'immediate' },
    { leaveTypeId: 'maternity', entityId: DEFAULT_ENTITY, minServiceMonths: 0, accrualMethod: 'immediate' },
    { leaveTypeId: 'paternity', entityId: DEFAULT_ENTITY, minServiceMonths: 0, accrualMethod: 'immediate' },
    { leaveTypeId: 'hajj', entityId: DEFAULT_ENTITY, minServiceMonths: 24, accrualMethod: 'immediate' },
    { leaveTypeId: 'unpaid', entityId: DEFAULT_ENTITY, minServiceMonths: 6, accrualMethod: 'immediate' },
];
export function getLeaveTypes(entityId) {
    return LEAVE_TYPES.filter((t) => t.entityId === entityId || t.entityId === DEFAULT_ENTITY);
}
export function getLeavePolicy(leaveTypeId, entityId) {
    return LEAVE_POLICIES.find((p) => p.leaveTypeId === leaveTypeId && (p.entityId === entityId || p.entityId === DEFAULT_ENTITY));
}
