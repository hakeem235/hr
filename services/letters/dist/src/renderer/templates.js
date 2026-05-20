/**
 * Letter templates — one function per type per language.
 * Config-driven: each template is pure data (no PDF knowledge here).
 * Adding a new letter type = adding an entry to TEMPLATES.
 */
// ─── Templates ────────────────────────────────────────────────────────────────
const TEMPLATES = {
    salary_certificate: {
        en: (ctx) => ({
            subject: 'Salary Certificate',
            salutation: ctx.recipientName ? `Dear ${ctx.recipientName},` : 'To Whom It May Concern,',
            paragraphs: [
                `This is to certify that ${ctx.nameEn}, holding ${ctx.nationality} nationality` +
                    (ctx.idNumber ? ` and bearing ID/Iqama No. ${ctx.idNumber}` : '') +
                    `, is currently employed with ${ctx.entityNameEn} as ${ctx.positionEn}` +
                    ` in the ${ctx.departmentEn} department since ${ctx.joinDateFormatted}.`,
                `Their monthly basic salary is ${ctx.salaryFormatted}.`,
                `This certificate is issued upon the employee's request for the purpose of` +
                    ` ${ctx.purpose}. It is provided without any liability on the part of ${ctx.entityNameEn}.`,
            ],
            closing: 'Yours sincerely,',
            signatory: 'Human Resources Department',
        }),
        ar: (ctx) => ({
            subject: 'شهادة راتب',
            salutation: ctx.recipientName
                ? `السيد/السيدة ${ctx.recipientName} المحترم/المحترمة،`
                : 'إلى من يهمه الأمر،',
            paragraphs: [
                `نشهد بأن الموظف / ${ctx.nameAr}، يحمل جنسية ${ctx.nationalityAr}` +
                    (ctx.idNumber ? `، برقم الإقامة/الهوية: ${ctx.idNumber}` : '') +
                    `، يعمل لدى ${ctx.entityNameAr} بمسمى وظيفي "${ctx.positionAr}"` +
                    ` في قسم ${ctx.departmentAr} منذ ${ctx.joinDateFormatted}.`,
                `وراتبه الأساسي الشهري هو ${ctx.salaryFormatted}.`,
                `صدرت هذه الشهادة بناءً على طلب الموظف لغرض ${ctx.purpose}،` +
                    ` دون أدنى مسؤولية على ${ctx.entityNameAr}.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
    employment_certificate: {
        en: (ctx) => ({
            subject: 'Employment Certificate',
            salutation: ctx.recipientName ? `Dear ${ctx.recipientName},` : 'To Whom It May Concern,',
            paragraphs: [
                `This is to certify that ${ctx.nameEn}` +
                    (ctx.idNumber ? `, ID/Iqama No. ${ctx.idNumber},` : '') +
                    ` is a current employee of ${ctx.entityNameEn}.`,
                `${ctx.nameEn} serves as ${ctx.positionEn} in the ${ctx.departmentEn}` +
                    ` department and has been with the organisation since ${ctx.joinDateFormatted}.`,
                `This certificate is issued upon the employee's request for the purpose of ${ctx.purpose}.`,
            ],
            closing: 'Yours sincerely,',
            signatory: 'Human Resources Department',
        }),
        ar: (ctx) => ({
            subject: 'شهادة عمل',
            salutation: ctx.recipientName
                ? `السيد/السيدة ${ctx.recipientName} المحترم/المحترمة،`
                : 'إلى من يهمه الأمر،',
            paragraphs: [
                `نشهد بأن الموظف / ${ctx.nameAr}` +
                    (ctx.idNumber ? `، رقم الإقامة/الهوية: ${ctx.idNumber}،` : '') +
                    ` موظف حالياً لدى ${ctx.entityNameAr}.`,
                `يشغل ${ctx.nameAr} منصب "${ctx.positionAr}" في قسم ${ctx.departmentAr}` +
                    ` ويعمل في المنظمة منذ ${ctx.joinDateFormatted}.`,
                `صدرت هذه الشهادة بناءً على طلب الموظف لغرض ${ctx.purpose}.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
    experience_letter: {
        en: (ctx) => ({
            subject: 'Experience Letter',
            salutation: ctx.recipientName ? `Dear ${ctx.recipientName},` : 'To Whom It May Concern,',
            paragraphs: [
                `This letter confirms that ${ctx.nameEn} was employed with ${ctx.entityNameEn}` +
                    ` as ${ctx.positionEn} in the ${ctx.departmentEn} department since ${ctx.joinDateFormatted}.`,
                `During their tenure, ${ctx.nameEn} demonstrated professionalism and dedication` +
                    ` in fulfilling their responsibilities.`,
                `We wish them continued success in their future endeavours.`,
            ],
            closing: 'Yours sincerely,',
            signatory: 'Human Resources Department',
        }),
        ar: (ctx) => ({
            subject: 'خطاب خبرة',
            salutation: ctx.recipientName
                ? `السيد/السيدة ${ctx.recipientName} المحترم/المحترمة،`
                : 'إلى من يهمه الأمر،',
            paragraphs: [
                `نشهد بأن الموظف / ${ctx.nameAr} عمل لدى ${ctx.entityNameAr}` +
                    ` بمسمى وظيفي "${ctx.positionAr}" في قسم ${ctx.departmentAr} منذ ${ctx.joinDateFormatted}.`,
                `خلال فترة عمله، أثبت ${ctx.nameAr} كفاءةً ومهنيةً عاليتين في أداء مهامه.`,
                `نتمنى له التوفيق والنجاح في مسيرته المهنية.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
    noc: {
        en: (ctx) => ({
            subject: 'No Objection Certificate (NOC)',
            salutation: ctx.recipientName ? `Dear ${ctx.recipientName},` : 'To Whom It May Concern,',
            paragraphs: [
                `This letter confirms that ${ctx.nameEn}` +
                    (ctx.idNumber ? `, ID/Iqama No. ${ctx.idNumber},` : '') +
                    ` is currently employed with ${ctx.entityNameEn} as ${ctx.positionEn}.`,
                `${ctx.entityNameEn} has no objection to ${ctx.nameEn}` +
                    ` for the purpose of: ${ctx.purpose}.`,
                `This certificate is issued upon the employee's request and does not constitute` +
                    ` any waiver of rights or obligations on the part of either party.`,
            ],
            closing: 'Yours sincerely,',
            signatory: 'Human Resources Department',
        }),
        ar: (ctx) => ({
            subject: 'شهادة عدم ممانعة',
            salutation: ctx.recipientName
                ? `السيد/السيدة ${ctx.recipientName} المحترم/المحترمة،`
                : 'إلى من يهمه الأمر،',
            paragraphs: [
                `نشهد بأن الموظف / ${ctx.nameAr}` +
                    (ctx.idNumber ? `، رقم الإقامة/الهوية: ${ctx.idNumber}،` : '') +
                    ` يعمل لدى ${ctx.entityNameAr} بمسمى وظيفي "${ctx.positionAr}".`,
                `لا تمانع ${ctx.entityNameAr} من قيام ${ctx.nameAr} بـ: ${ctx.purpose}.`,
                `صدرت هذه الشهادة بناءً على طلب الموظف ولا تُعدّ تنازلاً عن أي حق أو التزام.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
    bank_letter: {
        en: (ctx) => ({
            subject: 'Salary Bank Transfer Letter',
            salutation: 'Dear Sir/Madam,',
            paragraphs: [
                `We confirm the following employment details for salary transfer purposes:`,
                `Name: ${ctx.nameEn}\nPosition: ${ctx.positionEn}\nDepartment: ${ctx.departmentEn}\n` +
                    `Employment Date: ${ctx.joinDateFormatted}\nMonthly Basic Salary: ${ctx.salaryFormatted}`,
                `Please arrange for the monthly salary to be transferred to the bank account` +
                    ` registered in our records. We appreciate your cooperation.`,
            ],
            closing: 'Yours sincerely,',
            signatory: 'Human Resources Department',
        }),
        ar: (ctx) => ({
            subject: 'خطاب تحويل الراتب إلى البنك',
            salutation: 'السادة المحترمون،',
            paragraphs: [
                `نفيدكم بالبيانات التالية الخاصة بالموظف لأغراض تحويل الراتب:`,
                `الاسم: ${ctx.nameAr}\nالمسمى الوظيفي: ${ctx.positionAr}\nالقسم: ${ctx.departmentAr}\n` +
                    `تاريخ الالتحاق: ${ctx.joinDateFormatted}\nالراتب الأساسي الشهري: ${ctx.salaryFormatted}`,
                `يُرجى تحويل الراتب الشهري إلى الحساب البنكي المسجل في سجلات شركتنا.` +
                    ` شاكرين تعاونكم الدائم.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
    embassy_letter: {
        en: (ctx) => ({
            subject: ctx.recipientName ? `To: ${ctx.recipientName}` : 'To the Consulate / Embassy',
            salutation: ctx.recipientName
                ? `Dear ${ctx.recipientName},`
                : 'To the Consulate / Embassy,',
            paragraphs: [
                `We are writing to confirm that ${ctx.nameEn}` +
                    (ctx.idNumber ? `, ID/Iqama No. ${ctx.idNumber},` : '') +
                    ` is currently employed with ${ctx.entityNameEn}.`,
                `${ctx.nameEn} serves as ${ctx.positionEn} in the ${ctx.departmentEn}` +
                    ` department and has been with the organisation since ${ctx.joinDateFormatted}.` +
                    ` Their monthly basic salary is ${ctx.salaryFormatted}.`,
                `We fully support ${ctx.nameEn}'s application for the purpose of ${ctx.purpose}` +
                    ` and kindly request the cooperation of the concerned authorities.`,
                `Should you require further information, please do not hesitate to contact us.`,
            ],
            closing: 'Yours faithfully,',
            signatory: 'Human Resources Department',
        }),
        ar: (ctx) => ({
            subject: ctx.recipientName ? `إلى: ${ctx.recipientName}` : 'إلى السفارة / القنصلية',
            salutation: ctx.recipientName
                ? `السيد/السيدة ${ctx.recipientName} المحترم/المحترمة،`
                : 'إلى السفارة / القنصلية،',
            paragraphs: [
                `يسرنا إفادتكم بأن الموظف / ${ctx.nameAr}` +
                    (ctx.idNumber ? `، رقم الإقامة/الهوية: ${ctx.idNumber}،` : '') +
                    ` يعمل لدى ${ctx.entityNameAr}.`,
                `يشغل ${ctx.nameAr} منصب "${ctx.positionAr}" في قسم ${ctx.departmentAr}` +
                    ` ويعمل في المنظمة منذ ${ctx.joinDateFormatted}،` +
                    ` براتب أساسي شهري قدره ${ctx.salaryFormatted}.`,
                `ندعم ${ctx.nameAr} في طلبه الخاص بـ ${ctx.purpose}` +
                    ` ونأمل من الجهات المعنية تقديم التعاون اللازم.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
    salary_transfer: {
        ar: (ctx) => ({
            subject: 'خطاب تحويل راتب',
            salutation: 'السادة المحترمون،',
            paragraphs: [
                `نطلب منكم التكرم بتحويل الراتب الشهري للموظف / ${ctx.nameAr}` +
                    ` البالغ ${ctx.salaryFormatted} إلى الحساب البنكي المسجل في سجلات الشركة.`,
                `البيانات الوظيفية:\nالمسمى الوظيفي: ${ctx.positionAr}\nالقسم: ${ctx.departmentAr}\n` +
                    `تاريخ الالتحاق: ${ctx.joinDateFormatted}`,
                `يُرجى الإشارة إلى رقم الموظف في حقل المرجع عند إتمام التحويل.` +
                    ` شاكرين تعاونكم الدائم.`,
            ],
            closing: 'وتفضلوا بقبول فائق التحية والاحترام،',
            signatory: 'قسم الموارد البشرية',
        }),
    },
};
export function getTemplate(typeId) {
    return (TEMPLATES[typeId] ?? {
        en: (ctx) => ({
            subject: 'HR Letter',
            salutation: 'To Whom It May Concern,',
            paragraphs: [`This letter is issued to ${ctx.nameEn} for the purpose of ${ctx.purpose}.`],
            closing: 'Yours sincerely,',
            signatory: 'Human Resources Department',
        }),
    });
}
