import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStageService, type StageStudent, type StageStaff } from '../src/domain/stage.ts';

const students: StageStudent[] = Array.from({ length: 8 }, (_, i) => ({ id: `student-${i}`, name: `가상학생${i}`, gender: i < 4 ? 'FEMALE' : 'MALE', department: 'FIRST', team: 'SINGER', isStudentLeader: false }));
const staff: StageStaff[] = Array.from({ length: 10 }, (_, i) => ({ id: `staff-${i}`, name: `가상스탭${i}`, gender: i < 5 ? 'FEMALE' : 'MALE', preferredService: 'BOTH', singerCapable: true, excludeFromAutoSinger: false }));
const params = { department: 'FIRST' as const, students, staff, eligibleStudentIds: new Set(students.map(x => x.id)), presentSingerStaffIds: new Set(staff.map(x => x.id)), histories: new Map(), singerTarget: 8, choirTarget: 6, leaderType: 'STAFF' as const, leaderId: 'leader', overrides: [], usedStaffIds: new Set<string>() };
test('large choir target must not consume all students and leave singers entirely to staff', () => {
  const result = generateStageService({ ...params, usedStaffIds: new Set() });
  const studentSingers = result.assignments.filter(x => x.personType === 'STUDENT' && x.role === 'SINGER');
  const staffAssigned = result.assignments.filter(x => x.personType === 'STAFF');
  assert.ok(studentSingers.length >= 1);
  assert.ok(staffAssigned.length >= 1 && staffAssigned.length <= 3);
  assert.ok(staffAssigned.every(x => x.role === 'SINGER'));
  assert.ok(staffAssigned.length < staff.length);
});
test('student shortage never makes ordinary auto assignment place more than three staff', () => {
  const result = generateStageService({ ...params, students: [], usedStaffIds: new Set() });
  assert.equal(result.assignments.length, 3);
  assert.ok(result.warnings.some(x => x.includes('부족')));
});
test('no attending staff means students are still assigned without fabricating staff', () => {
  const result = generateStageService({ ...params, presentSingerStaffIds: new Set(), usedStaffIds: new Set() });
  assert.ok(result.assignments.some(x => x.personType === 'STUDENT'));
  assert.equal(result.assignments.some(x => x.personType === 'STAFF'), false);
});
test('zero singer target does not place supporting staff', () => {
  const result = generateStageService({ ...params, singerTarget: 0, usedStaffIds: new Set() });
  assert.equal(result.assignments.some(x => x.personType === 'STAFF'), false);
});
