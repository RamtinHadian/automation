import { Department, User } from '../types';

/** The units this person manages (a unit has at most one manager: departments[].managerId). */
export const managedDepartments = (departments: Department[], userId: string) => departments.filter((d) => d.managerId === userId);

/** The people who work in the units this person manages (not the manager). */
export const managedStaffIds = (departments: Department[], staff: User[], userId: string): string[] => {
  const mine = new Set(managedDepartments(departments, userId).map((d) => d.id));
  return staff.filter((u) => mine.has(u.departmentId) && u.id !== userId).map((u) => u.id);
};
