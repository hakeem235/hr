/**
 * Client for fetching employee + entity data from the people service.
 * Mirrors wf-client.ts pattern.
 */

import type { EmployeeData, EntityData } from './renderer/index.js';

export interface PeopleClient {
  getEmployee(employeeId: string): Promise<EmployeeData | null>;
  getEntity(entityId: string): Promise<EntityData | null>;
}

export function createPeopleClient(baseUrl: string): PeopleClient {
  return {
    async getEmployee(employeeId) {
      try {
        const res = await fetch(`${baseUrl}/api/v1/employees/${employeeId}`);
        if (!res.ok) return null;
        // Map people service schema to EmployeeData
        const d = await res.json() as Record<string, unknown>;
        return {
          nameEn:            String(d.nameEn ?? d.name ?? ''),
          nameAr:            String(d.nameAr ?? ''),
          positionEn:        String(d.positionEn ?? d.position ?? ''),
          positionAr:        String(d.positionAr ?? ''),
          departmentEn:      String(d.departmentEn ?? d.department ?? ''),
          departmentAr:      String(d.departmentAr ?? ''),
          joinDate:          String(d.joinDate ?? d.hireDate ?? new Date().toISOString()),
          basicSalaryHalala: Number(d.basicSalaryHalala ?? d.basicSalary ?? 0),
          nationality:       String(d.nationality ?? 'Saudi'),
          nationalityAr:     String(d.nationalityAr ?? 'سعودي'),
          idNumber:          d.iqamaNumber ? String(d.iqamaNumber) : undefined,
        };
      } catch {
        return null;
      }
    },

    async getEntity(entityId) {
      try {
        const res = await fetch(`${baseUrl}/api/v1/entities/${entityId}`);
        if (!res.ok) return null;
        const d = await res.json() as Record<string, unknown>;
        return {
          nameEn:   String(d.nameEn ?? ''),
          nameAr:   String(d.nameAr ?? ''),
          crNumber: String(d.crNumber ?? ''),
        };
      } catch {
        return null;
      }
    },
  };
}

// ─── Seeded fallback data ─────────────────────────────────────────────────────
// Matches seeded letter records in index.ts and people service seeded employees.

const SEEDED_EMPLOYEES: Record<string, EmployeeData> = {
  emp_018f23: {
    nameEn: 'Sara Al-Qahtani',      nameAr: 'سارة القحطاني',
    positionEn: 'Software Engineer', positionAr: 'مهندسة برمجيات',
    departmentEn: 'Engineering',     departmentAr: 'الهندسة',
    joinDate: '2023-03-01',
    basicSalaryHalala: 1_500_000,   // SAR 15,000
    nationality: 'Saudi',            nationalityAr: 'سعودية',
    idNumber: '1098765432',
  },
  emp_004a11: {
    nameEn: 'Ahmed Hassan',         nameAr: 'أحمد حسن',
    positionEn: 'Product Manager',  positionAr: 'مدير المنتج',
    departmentEn: 'Product',        departmentAr: 'المنتج',
    joinDate: '2022-09-15',
    basicSalaryHalala: 1_800_000,   // SAR 18,000
    nationality: 'Egyptian',        nationalityAr: 'مصري',
    idNumber: '2143865219',
  },
  emp_07d2f9: {
    nameEn: 'Mohammed Al-Zahrani',  nameAr: 'محمد الزهراني',
    positionEn: 'HR Specialist',    positionAr: 'أخصائي موارد بشرية',
    departmentEn: 'Human Resources',departmentAr: 'الموارد البشرية',
    joinDate: '2021-07-01',
    basicSalaryHalala: 1_200_000,   // SAR 12,000
    nationality: 'Saudi',           nationalityAr: 'سعودي',
    idNumber: '1076543219',
  },
};

const SEEDED_ENTITIES: Record<string, EntityData> = {
  ent_default: {
    nameEn: 'TechCorp Arabia Ltd.',
    nameAr: 'شركة تك كورب العربية المحدودة',
    crNumber: '1010000001',
  },
};

export function createFallbackPeopleClient(
  httpClient: PeopleClient,
): PeopleClient {
  return {
    async getEmployee(id) {
      return (await httpClient.getEmployee(id)) ?? SEEDED_EMPLOYEES[id] ?? null;
    },
    async getEntity(id) {
      return (await httpClient.getEntity(id)) ?? SEEDED_ENTITIES[id] ?? null;
    },
  };
}
