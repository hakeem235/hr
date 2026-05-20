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
import type { GosiContribution } from './types.js';
export declare function calculateGosi(employeeId: string, basicMinor: number, nationality: string): GosiContribution;
