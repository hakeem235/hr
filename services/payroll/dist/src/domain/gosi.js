/**
 * GOSI (General Organization for Social Insurance) contribution calculator.
 * KSA-specific rules as of 2024:
 *
 * Saudi nationals:
 *   Employee deduction:  9.75% × basic  (annuity insurance)
 *   Employer share:      9.75% × basic  (annuity) + 2.00% × basic (SANED/unemployment) = 11.75%
 *
 * Expatriates (non-Saudi):
 *   Employee deduction:  0%
 *   Employer share:      2.00% × basic  (occupational hazard only)
 *
 * Base: basic salary only — housing and transport allowances are excluded per GOSI rules.
 * All amounts in minor units (halalas). Use Math.floor — never round up for deductions.
 */
import { PayrollError } from './errors.js';
// Rate constants × 10_000 to avoid floats
const SAUDI_EMPLOYEE_RATE_BPS = 975; //  9.75%
const SAUDI_EMPLOYER_RATE_BPS = 1175; // 11.75%
const EXPAT_EMPLOYER_RATE_BPS = 200; //  2.00%
function applyBps(minor, bps) {
    // floor(minor × bps / 10000) — integer-safe
    return Math.floor((minor * bps) / 10_000);
}
export function calculateGosi(employeeId, basicMinor, nationality) {
    if (basicMinor < 0) {
        throw new PayrollError('VALIDATION', 'basicMinor must be non-negative', 'basicMinor');
    }
    const isSaudi = nationality.toUpperCase() === 'SA';
    const employeeDeductionMinor = isSaudi
        ? applyBps(basicMinor, SAUDI_EMPLOYEE_RATE_BPS)
        : 0;
    const employerContributionMinor = isSaudi
        ? applyBps(basicMinor, SAUDI_EMPLOYER_RATE_BPS)
        : applyBps(basicMinor, EXPAT_EMPLOYER_RATE_BPS);
    return {
        employeeId,
        basicMinor,
        nationality,
        isSaudi,
        employeeDeductionMinor,
        employerContributionMinor,
        totalContributionMinor: employerContributionMinor, // employer's cost; employee share is already in their payslip
    };
}
