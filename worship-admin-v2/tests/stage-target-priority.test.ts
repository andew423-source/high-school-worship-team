import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStageService, type StageStudent, type StageStaff, type StageHistory } from '../src/domain/stage.ts';
const students: StageStudent[] = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `가상학생${i}`, gender: i < 5 ? 'FEMALE' : 'MALE', department: 'FIRST', team: 'SINGER', isStudentLeader: false }));
const staff: StageStaff[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `가상스탭${i}`, gender: 'FEMALE', preferredService: 'BOTH', singerCapable: true, excludeFromAutoSinger: false }));
const input = { department: 'FIRST' as const, students, staff, eligibleStudentIds: new Set(students.map(s=>s.id)), presentSingerStaffIds: new Set(staff.map(s=>s.id)), histories: new Map<string, StageHistory>(), singerTarget: 6, choirTarget: 4, leaderType: 'STAFF' as const, leaderId: 'leader', overrides: [], usedStaffIds: new Set<string>() };
test('6/4 exact target, student ratio and at most three singer staff', () => {
  const r = generateStageService({...input, usedStaffIds:new Set()});
  assert.equal(r.assignments.filter(p=>p.role==='SINGER').length,6);
  assert.equal(r.assignments.filter(p=>p.role==='CHOIR').length,4);
  const students = r.assignments.filter(p=>p.personType==='STUDENT').length;
  assert.ok(students>=7 && students<=8);
  assert.ok(r.assignments.filter(p=>p.personType==='STAFF').every(p=>p.role==='SINGER'));
});
test('when only seven students are available exact 6/4 uses three staff', () => {
  const r=generateStageService({...input,students:students.slice(0,7),usedStaffIds:new Set()});
  assert.equal(r.assignments.filter(p=>p.role==='SINGER').length,6);
  assert.equal(r.assignments.filter(p=>p.role==='CHOIR').length,4);
  assert.equal(r.assignments.filter(p=>p.personType==='STAFF').length,3);
  assert.ok(r.warnings.some(w=>w.includes('비율')));
});
test('consecutive attendance is relaxed only with an explicit warning when needed to fill roles', () => {
  const histories=new Map(students.map(s=>[s.id,{totalCount:2,singerCount:2,stagedPreviousTwo:true,singerPreviousTwo:true,missedPrevious:false}]));
  const r=generateStageService({...input,histories,usedStaffIds:new Set()});
  assert.equal(r.assignments.length,10);
  assert.ok(r.warnings.some(w=>w.includes('3주 연속 등단')));
});
test('targets are never exceeded across varying headcounts including zero-role targets', () => {
  for(let n=0;n<=10;n++) for(let singers=0;singers<=8;singers++) for(let choir=0;choir<=6;choir++) {
    const r=generateStageService({...input,students:students.slice(0,n),singerTarget:singers,choirTarget:choir,usedStaffIds:new Set()});
    assert.ok(r.assignments.filter(p=>p.role==='SINGER').length<=singers);
    assert.ok(r.assignments.filter(p=>p.role==='CHOIR').length<=choir);
    assert.ok(r.assignments.filter(p=>p.personType==='STAFF').length<=3);
    if(n>=choir && n+Math.min(3,singers)>=singers+choir) assert.equal(r.assignments.length,singers+choir);
  }
});
