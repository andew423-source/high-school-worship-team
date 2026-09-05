# 재구축 아키텍처

## 요청 흐름

```text
공개 랜딩
  └─ Google OAuth
      ├─ allowlist 운영자 → ACTIVE / ADMIN → 운영 센터
      └─ 일반 계정 → PENDING / GROUP_STAFF → 승인 대기
          └─ 운영자가 staff 레코드 연결
              └─ ACTIVE / GROUP_STAFF → 주차별 안내
```

`profiles.status`가 `ACTIVE`가 아니면 화면 라우팅, 서버 API 검사, Supabase RLS 중 어느 경로에서도 운영 데이터를 읽을 수 없습니다.

## 경계

- `auth.users`: Supabase가 관리하는 Google 신원
- `profiles`: 앱 역할과 접근 상태
- `staff`: 실제 찬양팀 스탭 데이터
- `access_requests`: 계정과 스탭 연결 승인 상태
- `audit_events`: 누가 승인·중지했는지 보존하는 변경 이력
- `terms`: 학기 기간, 활성 상태, 지각 인정 설정
- `students`: 학기와 무관한 학생 식별정보
- `term_students`: 학년·성별·예배 부서·팀·학생 인도자 등 학기별 정보
- `meetings`: 정규 토요모임, 임시 모임과 휴강 상태
- `import_batches`: 명단 가져오기 결과와 private Storage 원본 경로
- `grouping_rules`: 학기별 같은 조·다른 조·톱시드·최소 구성 조건
- `grouping_versions`, `groups`, `group_*_members`: 조 편성 스냅숏과 학생·스탭 배정
- `attendance`: 모임·학생별 출석 상태와 셀 단위 수정 이력
- `stage_plans`, `stage_staff_availability`: 토요모임과 다음 날 주일, 스탭 참석·역할
- `stage_versions`, `stage_services`, `stage_candidates`, `stage_overrides`, `stage_assignments`: 등단 후보·특이사항·배정 스냅숏

로그인 계정과 실제 스탭을 분리했기 때문에 이메일이 바뀌거나 스탭 정보가 학기마다 달라져도 Google 신원 데이터와 운영 데이터를 섞지 않습니다.

## 2단계 데이터 흐름

학기 생성은 `create_term_with_meetings` DB 함수 한 트랜잭션에서 처리해 학기만 생기고 모임이 빠지는 상태를 막습니다. 활성 학기를 새로 지정하면 이전 활성 학기는 보관 상태로 전환됩니다.

파일 가져오기는 `파일 읽기 → 열 매핑 → 행 검증 → 기존 데이터 중복 검토 → private Storage 보관 → DB 트랜잭션 저장` 순서입니다. 동명이인은 자동 병합하지 않고 사용자가 검토하도록 중단합니다.

## 조·출결·등단 데이터 흐름

조 편성은 자동 결과를 `AUTO_DRAFT`로 저장합니다. 첫 수동 저장은 원본을 복제한 `MANUAL_DRAFT`, 확정은 다시 복제한 `CONFIRMED` 버전이므로 과거 결과를 덮어쓰지 않습니다. 출결 권한은 최신 확정 조의 담당 스탭 연결을 기준으로 화면·Route Handler·RLS에서 동일하게 검사합니다.

출결 셀은 `(meeting_id, term_student_id)` 고유값과 `updated_at` revision으로 충돌을 확인합니다. UI는 해당 셀만 낙관적으로 바꾸고 성공한 revision만 반영하므로 매 입력마다 전체 표를 다시 가져오지 않습니다.

등단은 `stage_plan → AUTO_DRAFT → MANUAL_DRAFT → CONFIRMED` 순서로 보존합니다. 조 담당 스탭은 전체 등단 도구를 사용할 수 있지만 attendance 테이블 전체에는 접근하지 못합니다. `get_stage_attendance` 보안 함수를 통해 선택 주차의 학생 ID·상태·수정 시각만 받아 후보를 계산합니다.
