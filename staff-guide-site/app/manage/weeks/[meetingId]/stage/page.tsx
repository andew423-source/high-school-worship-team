import Link from "next/link";
import { all, first } from "../../../../../db/runtime";
import { requireAuthorizedUser } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
type Service = { id: string; sunday_date: string; service_part: number; status: string };
type Assignment = { service_id: string; name: string; role: "leader" | "singer" | "choir"; side: "left" | "center" | "right"; position_order: number };

function serviceSide(assignments: Assignment[], serviceId: string, role: string, side: string) { return assignments.filter((item) => item.service_id === serviceId && item.role === role && item.side === side).sort((a, b) => a.position_order - b.position_order); }

export default async function StaffStageView({ params }: { params: Promise<{ meetingId: string }> }) {
  const [{ meetingId }] = await Promise.all([params, requireAuthorizedUser("/manage")]);
  const meeting = await first<{ id: string; meeting_date: string; term_id: string; week_number: number }>(`SELECT m.id,m.meeting_date,m.term_id,(SELECT COUNT(*) FROM meetings counted WHERE counted.term_id=m.term_id AND counted.kind<>'break' AND counted.meeting_date<=m.meeting_date) week_number FROM meetings m WHERE m.id=?`, [meetingId]);
  if (!meeting) return <main className="manage-content"><section className="week-empty"><h1>모임을 찾을 수 없습니다.</h1></section></main>;
  const sunday = new Date(`${meeting.meeting_date}T00:00:00Z`); sunday.setUTCDate(sunday.getUTCDate() + 1); const sundayDate = sunday.toISOString().slice(0, 10);
  const [services, assignments] = await Promise.all([
    all<Service>("SELECT id,sunday_date,service_part,status FROM services WHERE term_id=? AND sunday_date=? ORDER BY service_part", [meeting.term_id, sundayDate]),
    all<Assignment>("SELECT sa.service_id,COALESCE(s.name,st.name) name,sa.role,sa.side,sa.position_order FROM stage_assignments sa JOIN services sv ON sv.id=sa.service_id LEFT JOIN students s ON sa.person_type='student' AND s.id=sa.person_id LEFT JOIN staff st ON sa.person_type='staff' AND st.id=sa.person_id WHERE sv.term_id=? AND sv.sunday_date=? ORDER BY sv.service_part,sa.role,sa.side,sa.position_order", [meeting.term_id, sundayDate]),
  ]);
  const people = (items: Assignment[]) => <div className="stage-side">{items.map((item) => <div className="stage-person" key={`${item.service_id}:${item.role}:${item.side}:${item.position_order}`}><b>{item.name}</b></div>)}</div>;
  return <main className="manage-content staff-stage-view"><Link className="term-back" href={`/manage/weeks/${meetingId}`}>← {meeting.week_number}주차 메뉴</Link><header className="staff-stage-head"><p>{meeting.week_number}주차 · {Number(sundayDate.slice(5, 7))}월 {Number(sundayDate.slice(8, 10))}일 주일</p><h1>주일 등단표</h1><span>확정 전에는 운영자의 조정에 따라 명단이 달라질 수 있습니다.</span></header>{!services.length || !assignments.length ? <section className="week-empty"><h2>아직 등단표가 없습니다.</h2><p>운영자가 등단안을 만들면 이곳에서 확인할 수 있어요.</p></section> : <div className="staff-stage-grid">{services.map((service) => { const leader = assignments.find((item) => item.service_id === service.id && item.role === "leader"); return <section className="manage-panel staff-stage-service" key={service.id}><div className="stage-section-head"><h2>{service.service_part}부</h2><span className={`manage-badge${service.status === "confirmed" ? "" : " warn"}`}>{service.status === "confirmed" ? "확정" : "조정 중"}</span></div><div className="stage-board"><div className="stage-label">콰이어</div><div className="stage-row">{people(serviceSide(assignments, service.id, "choir", "left"))}<div />{people(serviceSide(assignments, service.id, "choir", "right"))}</div><div className="stage-label">싱어</div><div className="stage-row">{people(serviceSide(assignments, service.id, "singer", "left"))}<div />{people(serviceSide(assignments, service.id, "singer", "right"))}</div><div className="stage-row"><div /><div className="stage-person leader"><b>{leader?.name ?? "인도자 미정"}</b></div><div /></div></div></section>; })}</div>}</main>;
}
