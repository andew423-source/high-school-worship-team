"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldsFor, type ImportKind, type ImportMapping } from "@/domain/imports";

type StudentItem = { id: string; name: string; internalCode: string | null; grade: number; gender: string; service: string; team: string; isLeader: boolean; active: boolean };
type StaffItem = { id: string; name: string; email: string | null; gender: string; roleTitle: string | null; singerCapable: boolean; groupLeaderCapable: boolean; preferredService: string; defaultStageRole: string; excludeFromAutoSinger: boolean; isDefaultStageLeader: boolean; active: boolean };
type Preview = { headers: string[]; sampleRows: Record<string, unknown>[]; mapping: ImportMapping; validRows: number; errors: Array<{ row: number; message: string }>; rowWarnings: Array<{ row: number; message: string }> };

export function PeopleManager({ termId, students, staff }: { termId: string; students: StudentItem[]; staff: StaffItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<ImportKind>("STUDENTS");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function addStudent(formData: FormData) {
    await postDirect("/api/admin/students", { termId, student: {
      internalCode: nullable(formData.get("internalCode")), name: formData.get("name"), grade: Number(formData.get("grade")),
      gender: formData.get("gender"), serviceDepartment: formData.get("serviceDepartment"), team: formData.get("team"),
      isStudentLeader: formData.get("isStudentLeader") === "on", note: null, termNote: nullable(formData.get("termNote")), active: true,
    } });
  }

  async function addStaff(formData: FormData) {
    await postDirect("/api/admin/staff", { staff: {
      name: formData.get("name"), email: String(formData.get("email") ?? "").trim(), gender: formData.get("gender"),
      roleTitle: nullable(formData.get("roleTitle")), singerCapable: formData.get("singerCapable") === "on",
      groupLeaderCapable: formData.get("groupLeaderCapable") === "on", preferredService: formData.get("preferredService"),
      defaultStageRole: formData.get("defaultStageRole"), excludeFromAutoSinger: formData.get("excludeFromAutoSinger") === "on",
      isDefaultStageLeader: formData.get("isDefaultStageLeader") === "on", note: null, active: true,
    } });
  }

  async function postDirect(url: string, body: unknown) {
    setError(null);
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message ?? "등록하지 못했습니다.");
    startTransition(() => router.refresh());
  }

  return <>
    <div className="tab-list" role="tablist">
      <button className={tab === "STUDENTS" ? "active" : ""} onClick={() => setTab("STUDENTS")}>학생 {students.length}명</button>
      <button className={tab === "STAFF" ? "active" : ""} onClick={() => setTab("STAFF")}>스탭 {staff.length}명</button>
    </div>
    {error ? <div className="error-banner">{error}</div> : null}
    {tab === "STUDENTS" ? <section className="manager-grid">
      <div className="panel"><h2>학생 직접 등록</h2><form className="form-stack dense" action={addStudent}>
        <div className="form-grid two"><label className="form-field"><span>이름</span><input className="field" name="name" required /></label><label className="form-field"><span>내부 ID</span><input className="field" name="internalCode" /></label></div>
        <div className="form-grid three"><Select name="grade" label="학년" options={[["1", "1학년"], ["2", "2학년"], ["3", "3학년"]]} /><Select name="gender" label="성별" options={[["FEMALE", "여성"], ["MALE", "남성"]]} /><Select name="serviceDepartment" label="예배 부서" options={[["FIRST", "1부"], ["SECOND", "2부"]]} /></div>
        <div className="form-grid two"><Select name="team" label="팀" options={[["SINGER", "싱어"], ["SESSION", "세션"]]} /><label className="check-field"><input type="checkbox" name="isStudentLeader" /><span>학생 인도자</span></label></div>
        <label className="form-field"><span>학기 비고</span><input className="field" name="termNote" placeholder="선택 사항" /></label>
        <button className="button button-primary" disabled={pending}>학생 등록</button>
      </form></div>
      <ImportPanel kind="STUDENTS" termId={termId} onComplete={() => startTransition(() => router.refresh())} />
    </section> : <section className="manager-grid">
      <div className="panel"><h2>스탭 직접 등록</h2><form className="form-stack dense" action={addStaff}>
        <div className="form-grid two"><label className="form-field"><span>이름</span><input className="field" name="name" required /></label><label className="form-field"><span>이메일</span><input className="field" name="email" type="email" /></label></div>
        <div className="form-grid three"><Select name="gender" label="성별" options={[["FEMALE", "여성"], ["MALE", "남성"]]} /><Select name="preferredService" label="선호 예배" options={[["BOTH", "1·2부 모두"], ["FIRST", "1부"], ["SECOND", "2부"]]} /><label className="form-field"><span>역할</span><input className="field" name="roleTitle" placeholder="예: 세션팀 스탭" /></label></div>
        <div className="form-grid three"><Select name="defaultStageRole" label="기본 주일 역할" options={[["SINGER", "싱어"], ["SESSION", "세션"]]} /><label className="check-field"><input type="checkbox" name="singerCapable" defaultChecked /><span>싱어 가능</span></label><label className="check-field"><input type="checkbox" name="groupLeaderCapable" /><span>조 담당 가능</span></label></div>
        <div className="form-grid two"><label className="check-field"><input type="checkbox" name="excludeFromAutoSinger" /><span>자동 싱어 배정 제외</span></label><label className="check-field"><input type="checkbox" name="isDefaultStageLeader" /><span>기본 주일 인도자</span></label></div>
        <button className="button button-primary" disabled={pending}>스탭 등록</button>
      </form></div>
      <ImportPanel kind="STAFF" termId={termId} onComplete={() => startTransition(() => router.refresh())} />
    </section>}

    <section className="panel table-panel">
      <h2>{tab === "STUDENTS" ? "이번 학기 학생" : "전체 스탭"}</h2>
      <div className="data-table-wrap"><table className="data-table"><thead><tr>{tab === "STUDENTS" ? <><th>이름</th><th>학년</th><th>성별</th><th>예배</th><th>팀</th><th>인도자</th><th>상태</th></> : <><th>이름</th><th>성별</th><th>역할</th><th>싱어</th><th>주일 기본</th><th>자동 제외</th><th>기본 인도자</th><th>조 담당</th><th>선호 예배</th><th>상태</th></>}</tr></thead>
        <tbody>{tab === "STUDENTS" ? students.map((person) => <tr key={person.id}><td><strong>{person.name}</strong>{person.internalCode ? <small>{person.internalCode}</small> : null}</td><td>{person.grade}학년</td><td>{genderLabel(person.gender)}</td><td>{serviceLabel(person.service)}</td><td>{teamLabel(person.team)}</td><td>{person.isLeader ? "학생 인도자" : "-"}</td><td>{person.active ? "재적" : "비활성"}</td></tr>) : staff.map((person) => <tr key={person.id}><td><strong>{person.name}</strong>{person.email ? <small>{person.email}</small> : null}</td><td>{genderLabel(person.gender)}</td><td>{person.roleTitle ?? "-"}</td><td>{person.singerCapable ? "가능" : "-"}</td><td>{teamLabel(person.defaultStageRole)}</td><td>{person.excludeFromAutoSinger ? "제외" : "-"}</td><td>{person.isDefaultStageLeader ? "기본" : "-"}</td><td>{person.groupLeaderCapable ? "가능" : "-"}</td><td>{serviceLabel(person.preferredService)}</td><td>{person.active ? "활성" : "비활성"}</td></tr>)}</tbody>
      </table>{(tab === "STUDENTS" ? students : staff).length === 0 ? <div className="empty-state"><strong>아직 등록된 인원이 없어요.</strong>직접 입력하거나 파일로 가져와주세요.</div> : null}</div>
    </section>
  </>;
}

function ImportPanel({ kind, termId, onComplete }: { kind: ImportKind; termId: string; onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useMemo(() => fieldsFor(kind), [kind]);

  async function loadPreview(nextMapping?: ImportMapping) {
    if (!file) return setMessage("파일을 먼저 선택해주세요.");
    setBusy(true); setMessage(null);
    const form = new FormData(); form.set("file", file); form.set("kind", kind);
    if (nextMapping) form.set("mapping", JSON.stringify(nextMapping));
    const response = await fetch("/api/admin/imports/preview", { method: "POST", body: form });
    const payload = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) return setMessage(payload?.error?.message ?? "미리보기를 만들지 못했습니다.");
    setPreview(payload.data); setMapping(payload.data.mapping);
    setMessage(payload.data.errors.length
      ? `재검사 완료 · ${payload.data.errors.length}개 오류를 확인해주세요.`
      : `재검사 완료 · ${payload.data.validRows}명을 가져올 수 있습니다.`);
  }

  async function commit() {
    if (!file || !preview || preview.errors.length) return;
    setBusy(true); setMessage(null);
    const form = new FormData(); form.set("file", file); form.set("kind", kind); form.set("termId", termId); form.set("mapping", JSON.stringify(mapping));
    const response = await fetch("/api/admin/imports", { method: "POST", body: form });
    const payload = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) return setMessage(payload?.error?.message ?? "가져오지 못했습니다.");
    setMessage(`${payload.data.importedCount}명을 등록했습니다.`); setFile(null); setPreview(null); onComplete();
  }

  return <div className="panel"><h2>{kind === "STUDENTS" ? "학생 파일 가져오기" : "스탭 파일 가져오기"}</h2><p className="section-description">CSV·XLSX의 첫 번째 행을 열 이름으로 사용합니다. 저장 전 매핑과 오류를 먼저 확인합니다. <a className="text-link" href={`/templates/${kind === "STUDENTS" ? "students" : "staff"}-template.csv`} download>CSV 양식 받기</a></p>
    <div className="form-stack dense"><input className="file-field" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(null); }} />
      <button className="button button-secondary" type="button" disabled={!file || busy} onClick={() => loadPreview()}>{busy ? "읽는 중" : "열 자동 매핑"}</button>
      {message ? <div className={message.includes("등록했습니다") || (message.includes("재검사 완료") && !message.includes("오류")) ? "success-banner" : "error-banner"}>{message}</div> : null}
    </div>
    {preview ? <div className="import-preview"><h3>열 매핑</h3>{preview.headers.map((header) => <label className="mapping-row" key={header}><span>{header}</span><select className="field" value={mapping[header] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}><option value="">가져오지 않음</option>{fields.map((field) => <option key={field.key} value={field.key}>{field.label}{field.required ? " *" : ""}</option>)}</select></label>)}
      <button className="plain-button mapping-refresh" type="button" disabled={busy} onClick={() => loadPreview(mapping)}>{busy ? "재검사 중..." : "변경한 매핑으로 다시 검사"}</button>
      <div className="preview-count"><strong>{preview.validRows}명 인식</strong><span>오류 {preview.errors.length}개 · 확인 {preview.rowWarnings.length}개</span></div>
      {[...preview.errors, ...preview.rowWarnings].slice(0, 8).map((issue, index) => <p className="row-issue" key={`${issue.row}-${index}`}>{issue.row}행 · {issue.message}</p>)}
      <div className="data-table-wrap mini"><table className="data-table"><thead><tr>{preview.headers.slice(0, 5).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.sampleRows.slice(0, 3).map((row, index) => <tr key={index}>{preview.headers.slice(0, 5).map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}</tr>)}</tbody></table></div>
      <button className="button button-primary" type="button" disabled={busy || preview.errors.length > 0} onClick={commit}>{busy ? "저장 중" : `${preview.validRows}명 가져오기`}</button>
    </div> : null}
  </div>;
}

function Select({ name, label, options }: { name: string; label: string; options: string[][] }) { return <label className="form-field"><span>{label}</span><select className="field" name={name}>{options.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>; }
function nullable(value: FormDataEntryValue | null) { const result = String(value ?? "").trim(); return result || null; }
function genderLabel(value: string) { return value === "FEMALE" ? "여성" : value === "MALE" ? "남성" : "미입력"; }
function serviceLabel(value: string) { return value === "FIRST" ? "1부" : value === "SECOND" ? "2부" : "1·2부"; }
function teamLabel(value: string) { return value === "SINGER" ? "싱어" : "세션"; }
