/**
 * End of Service Gratuity (EOSB) calculator.
 * KSA Labour Law Article 84 — voluntary resignation and termination rules.
 *
 * Voluntary resignation tiers (Art. 84):
 *   < 2 years:           no entitlement
 *   2–5 years:           1/3 × (21-day salary × years)
 *   5–10 years:          2/3 × (21-day salary × years)
 *   > 10 years:          full (21-day salary × years)
 *
 * Termination by employer (Art. 84):
 *   1–5 years:           half month salary per year
 *   > 5 years:           1 month salary per year
 *
 * Calculation base: last basic salary only (housing/transport excluded per standard practice).
 * Daily rate = lastBasicMinor / 30 (calendar days — standard KSA Labour practice).
 *
 * All amounts in minor units (halalas). Never floats.
 */
import type { EosbCalculation } from './types.js';
export type ResignationType = 'voluntary' | 'employer_termination';
export declare function calculateEosb(employeeId: string, hireDate: string, exitDate: string, lastBasicMinor: number, resignationType: ResignationType): EosbCalculation;
