/**
 * Leave type and policy definitions.
 * In production these are stored in the DB and edited by HR admins.
 * This seed data follows KSA Labour Law minimums.
 */
export interface LeaveType {
    id: string;
    entityId: string;
    name: string;
    nameAr: string;
    /** Max calendar days per request (0 = unlimited) */
    maxDaysPerRequest: number;
    /** Annual entitlement in working days */
    annualEntitlementDays: number;
    /** Whether a medical certificate is required */
    requiresAttachment: boolean;
    /** Minimum notice period in working days (0 = none) */
    minNoticeDays: number;
    /** Whether unused days carry over to next year */
    carryOver: boolean;
    /** Whether the leave is paid */
    paid: boolean;
}
export interface LeavePolicy {
    leaveTypeId: string;
    entityId: string;
    /** Minimum months of service to be eligible */
    minServiceMonths: number;
    /** Accrual: 'monthly' | 'annual' | 'immediate' */
    accrualMethod: 'monthly' | 'annual' | 'immediate';
    accrualRatePerMonth?: number;
}
export declare const LEAVE_TYPES: LeaveType[];
export declare const LEAVE_POLICIES: LeavePolicy[];
export declare function getLeaveTypes(entityId: string): LeaveType[];
export declare function getLeavePolicy(leaveTypeId: string, entityId: string): LeavePolicy | undefined;
