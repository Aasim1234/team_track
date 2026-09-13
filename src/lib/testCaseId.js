// VMS test cases are numbered by the database (vms_test_plan_rows.case_number);
// this is how that number is shown everywhere in the app.
export const formatCaseId = (n) => (n == null ? '' : `TC-${String(n).padStart(4, '0')}`)
