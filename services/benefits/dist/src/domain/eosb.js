import { BenefitError } from './errors.js';
function daysBetween(from, to) {
    return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}
/** Integer-safe floor to avoid float rounding. */
function floorMinor(value) {
    return Math.floor(value);
}
export function calculateEosb(employeeId, hireDate, exitDate, lastBasicMinor, resignationType) {
    if (exitDate <= hireDate) {
        throw new BenefitError('VALIDATION', 'exitDate must be after hireDate', 'exitDate');
    }
    if (lastBasicMinor < 0) {
        throw new BenefitError('VALIDATION', 'lastBasicMinor must be non-negative', 'lastBasicMinor');
    }
    const totalDays = daysBetween(hireDate, exitDate);
    const totalYears = totalDays / 365.25;
    const fractionalYears = totalYears % 1;
    // Daily rate: basic / 30 (KSA Labour standard)
    const dailyRateMinor = floorMinor(lastBasicMinor / 30);
    // 21-day rate per year of service
    const rate21dMinor = dailyRateMinor * 21;
    // Half-month rate (for employer termination tier 1)
    const halfMonthMinor = floorMinor(lastBasicMinor / 2);
    let totalEosbMinor = 0;
    const breakdown = [];
    if (resignationType === 'voluntary') {
        if (totalYears < 2) {
            // No entitlement
            breakdown.push({ label: 'Under 2 years — no entitlement', years: totalYears, multiplier: 0, amountMinor: 0 });
        }
        else if (totalYears <= 5) {
            const amount = floorMinor(rate21dMinor * totalYears * (1 / 3));
            breakdown.push({ label: 'Years 2–5 (1/3 entitlement)', years: totalYears, multiplier: 1 / 3, amountMinor: amount });
            totalEosbMinor = amount;
        }
        else if (totalYears <= 10) {
            const amount = floorMinor(rate21dMinor * totalYears * (2 / 3));
            breakdown.push({ label: 'Years 5–10 (2/3 entitlement)', years: totalYears, multiplier: 2 / 3, amountMinor: amount });
            totalEosbMinor = amount;
        }
        else {
            const amount = floorMinor(rate21dMinor * totalYears);
            breakdown.push({ label: 'Over 10 years (full entitlement)', years: totalYears, multiplier: 1, amountMinor: amount });
            totalEosbMinor = amount;
        }
    }
    else {
        // Employer termination: half-month per year for first 5, full month per year after
        const tier1Years = Math.min(totalYears, 5);
        const tier2Years = Math.max(0, totalYears - 5);
        if (tier1Years > 0) {
            const amount = floorMinor(halfMonthMinor * tier1Years);
            breakdown.push({ label: 'Years 1–5 (½ month/year)', years: tier1Years, multiplier: 0.5, amountMinor: amount });
            totalEosbMinor += amount;
        }
        if (tier2Years > 0) {
            const amount = floorMinor(lastBasicMinor * tier2Years);
            breakdown.push({ label: 'Years 5+ (1 month/year)', years: tier2Years, multiplier: 1, amountMinor: amount });
            totalEosbMinor += amount;
        }
    }
    return {
        employeeId,
        hireDate,
        exitDate,
        yearsOfService: Math.floor(totalYears),
        fractionalYears: Math.round(fractionalYears * 10000) / 10000,
        lastBasicMinor,
        totalEosbMinor,
        breakdown,
        calculatedAt: new Date().toISOString(),
    };
}
