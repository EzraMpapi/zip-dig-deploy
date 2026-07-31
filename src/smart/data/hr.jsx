/* ══════════════ HR DATA ══════════════ */
/* ---------------------------------- HR DATA ---------------------------------- */
export const DEPARTMENTS = ["Sales", "Operations", "Finance", "Warehouse", "Admin"];

export const EMPLOYMENT_STATUS_COLOR = {
  Active: "#16A34A",
  "On Leave": "#F59E0B",
  Inactive: "#9CA3AF",
};

export const LEAVE_STATUS_COLOR = {
  Pending: "#F59E0B",
  Approved: "#16A34A",
  Rejected: "#EF4444",
};

export const employeesSeed = [
  { id: "EMP-101", name: "Juma Batenga", role: "Sales Manager", department: "Sales", email: "j.batenga@beirahisi.co.tz", phone: "+255 754 220 981", status: "Active", salary: 2400, hireDate: "2023-02-14", contractType: "Permanent", contractEndDate: null },
  { id: "EMP-102", name: "Sarah Kileo", role: "Account Executive", department: "Sales", email: "s.kileo@beirahisi.co.tz", phone: "+255 712 004 552", status: "Active", salary: 1650, hireDate: "2023-08-01", contractType: "Permanent", contractEndDate: null },
  { id: "EMP-103", name: "Michael Fundi", role: "Account Executive", department: "Sales", email: "m.fundi@beirahisi.co.tz", phone: "+255 786 442 019", status: "On Leave", salary: 1650, hireDate: "2024-01-10", contractType: "Fixed-term", contractEndDate: "2027-01-10" },
  { id: "EMP-104", name: "Grace Mmbaga", role: "Warehouse Supervisor", department: "Warehouse", email: "g.mmbaga@beirahisi.co.tz", phone: "+255 767 331 220", status: "Active", salary: 1400, hireDate: "2022-11-05", contractType: "Permanent", contractEndDate: null },
  { id: "EMP-105", name: "Elias Rugambwa", role: "Logistics Coordinator", department: "Operations", email: "e.rugambwa@beirahisi.co.tz", phone: "+255 762 883 456", status: "Active", salary: 1550, hireDate: "2023-05-20", contractType: "Permanent", contractEndDate: null },
  { id: "EMP-106", name: "Fatuma Salim", role: "Accountant", department: "Finance", email: "f.salim@beirahisi.co.tz", phone: "+255 715 990 341", status: "Active", salary: 1900, hireDate: "2022-06-01", contractType: "Permanent", contractEndDate: null },
  { id: "EMP-107", name: "David Chen", role: "Operations Lead", department: "Operations", email: "d.chen@beirahisi.co.tz", phone: "+255 700 118 774", status: "Active", salary: 2200, hireDate: "2021-09-15", contractType: "Permanent", contractEndDate: null },
  { id: "EMP-108", name: "Halima Juma", role: "Office Administrator", department: "Admin", email: "h.juma@beirahisi.co.tz", phone: "+255 754 662 187", status: "Inactive", salary: 1100, hireDate: "2023-03-01", contractType: "Probation", contractEndDate: "2026-09-01" },
];

export const EMPLOYMENT_CONTRACT_TYPES = ["Permanent", "Fixed-term", "Probation"];

export const leaveRequestsSeed = [
  { id: "LV-501", employee: "Michael Fundi", type: "Annual", startDate: "2026-06-28", endDate: "2026-07-08", status: "Approved" },
  { id: "LV-500", employee: "Sarah Kileo", type: "Sick", startDate: "2026-07-01", endDate: "2026-07-02", status: "Pending" },
  { id: "LV-499", employee: "Grace Mmbaga", type: "Annual", startDate: "2026-07-15", endDate: "2026-07-19", status: "Pending" },
  { id: "LV-498", employee: "Elias Rugambwa", type: "Unpaid", startDate: "2026-06-10", endDate: "2026-06-12", status: "Approved" },
  { id: "LV-497", employee: "Fatuma Salim", type: "Sick", startDate: "2026-05-28", endDate: "2026-05-29", status: "Rejected" },
];

// Standard annual leave allocation used for balance tracking — a real
// policy number a company sets, not a computed fact, so it's a constant
// rather than something derived from data that doesn't exist yet.
export const ANNUAL_LEAVE_ALLOCATION = 21;

export function daysInclusive(startStr, endStr) {
  const ms = new Date(endStr) - new Date(startStr);
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

/* ══════════════ RECRUITMENT DATA ══════════════ */
/* ------------------------------- RECRUITMENT DATA -------------------------------- */
export const RECRUITMENT_STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];

export const RECRUITMENT_STAGE_COLOR = {
  Applied: "#5B6472",
  Screening: "#16A34A",
  Interview: "#F59E0B",
  Offer: "#F59E0B",
  Hired: "#16A34A",
  Rejected: "#9CA3AF",
};

export const candidatesSeed = [
  { id: "CAND-01", name: "Neema Kessy", role: "Warehouse Assistant", department: "Warehouse", stage: "Interview", email: "neema.kessy@gmail.com", appliedDate: "2026-06-20" },
  { id: "CAND-02", name: "Baraka Mwita", role: "Junior Accountant", department: "Finance", stage: "Screening", email: "b.mwita@gmail.com", appliedDate: "2026-06-25" },
  { id: "CAND-03", name: "Zawadi Ndosi", role: "Account Executive", department: "Sales", stage: "Offer", email: "zawadi.ndosi@gmail.com", appliedDate: "2026-06-10" },
  { id: "CAND-04", name: "Yusuph Mrema", role: "Logistics Coordinator", department: "Operations", stage: "Applied", email: "y.mrema@gmail.com", appliedDate: "2026-07-01" },
  { id: "CAND-05", name: "Consolata Peter", role: "Office Administrator", department: "Admin", stage: "Rejected", email: "consolata.p@gmail.com", appliedDate: "2026-06-05" },
];

/* ══════════════ ATTENDANCE DATA ══════════════ */
/* ------------------------------- ATTENDANCE DATA -------------------------------- */
export const ATTENDANCE_STATUS_COLOR = {
  Present: "#16A34A",
  Late: "#F59E0B",
  Absent: "#EF4444",
  "On Leave": "#5B6472",
};

export const attendanceSeed = [
  { id: "ATT-01", employee: "Juma Batenga", date: "2026-07-02", status: "Present", verified:true,  sigMethod:"biometric", clockIn:"08:02", clockOut:"17:05" },
  { id: "ATT-02", employee: "Sarah Kileo",  date: "2026-07-02", status: "Present", verified:true,  sigMethod:"biometric", clockIn:"07:58", clockOut:"17:01" },
  { id: "ATT-03", employee: "Michael Fundi", date: "2026-07-02", status: "On Leave" },
  { id: "ATT-04", employee: "Grace Mmbaga", date: "2026-07-02", status: "Late" },
  { id: "ATT-05", employee: "Elias Rugambwa", date: "2026-07-02", status: "Present" },
  { id: "ATT-06", employee: "Fatuma Salim", date: "2026-07-02", status: "Absent" },
  { id: "ATT-07", employee: "David Chen", date: "2026-07-02", status: "Present" },
];

/* ══════════════ PERFORMANCE DATA ══════════════ */
/* ------------------------------- PERFORMANCE DATA -------------------------------- */
export const PERFORMANCE_RATINGS = ["Excellent", "Good", "Satisfactory", "Needs Improvement"];

export const PERFORMANCE_RATING_COLOR = {
  Excellent: "#16A34A",
  Good: "#16A34A",
  Satisfactory: "#F59E0B",
  "Needs Improvement": "#EF4444",
};

export const performanceReviewsSeed = [
  { id: "PR-01", employee: "Juma Batenga", period: "H1 2026", rating: "Excellent", reviewer: "EzyMP", notes: "Exceeded sales targets by 18%.", date: "2026-06-30" },
  { id: "PR-02", employee: "Sarah Kileo", period: "H1 2026", rating: "Good", reviewer: "Juma Batenga", notes: "Consistent performer, strong client relationships.", date: "2026-06-30" },
  { id: "PR-03", employee: "Grace Mmbaga", period: "H1 2026", rating: "Good", reviewer: "David Chen", notes: "Improved warehouse turnaround time.", date: "2026-06-28" },
];

/* ══════════════ TRAINING DATA ══════════════ */
/* ------------------------------- TRAINING DATA -------------------------------- */
export const TRAINING_STATUS_COLOR = {
  "Not Started": "#5B6472",
  "In Progress": "#F59E0B",
  Completed: "#16A34A",
};

export const trainingSeed = [
  { id: "TRN-01", employee: "Sarah Kileo", course: "Advanced Negotiation Skills", status: "Completed", completionDate: "2026-05-15" },
  { id: "TRN-02", employee: "Elias Rugambwa", course: "Fleet Safety Certification", status: "In Progress", completionDate: null },
  { id: "TRN-03", employee: "Fatuma Salim", course: "IFRS Update Workshop", status: "Not Started", completionDate: null },
  { id: "TRN-04", employee: "Grace Mmbaga", course: "Warehouse Safety Refresher", status: "Completed", completionDate: "2026-06-01" },
];

/* ══════════════ BENEFITS DATA ══════════════ */
/* ------------------------------- BENEFITS DATA -------------------------------- */
export const BENEFIT_TYPES = ["Health Insurance", "Pension Fund", "Housing Allowance", "Transport Allowance"];

export const benefitsSeed = [
  { id: "BEN-01", employee: "Juma Batenga", type: "Health Insurance", monthlyValue: 120, status: "Active", enrollmentDate: "2023-02-14" },
  { id: "BEN-02", employee: "Juma Batenga", type: "Pension Fund", monthlyValue: 240, status: "Active", enrollmentDate: "2023-02-14" },
  { id: "BEN-03", employee: "Sarah Kileo", type: "Health Insurance", monthlyValue: 120, status: "Active", enrollmentDate: "2023-08-01" },
  { id: "BEN-04", employee: "Grace Mmbaga", type: "Transport Allowance", monthlyValue: 80, status: "Active", enrollmentDate: "2022-11-05" },
  { id: "BEN-05", employee: "David Chen", type: "Housing Allowance", monthlyValue: 300, status: "Active", enrollmentDate: "2021-09-15" },
];

/* ══════════════ PAYROLL DATA ══════════════ */
/* ------------------------------- PAYROLL DATA -------------------------------- */
export const payrollRunsSeed = [
  { id: "PR-2026-05", period: "May 2026", employeeCount: 7, totalAmount: 12800, status: "Processed", processedDate: "2026-05-28" },
  { id: "PR-2026-06", period: "June 2026", employeeCount: 7, totalAmount: 12800, status: "Processed", processedDate: "2026-06-27" },
];
