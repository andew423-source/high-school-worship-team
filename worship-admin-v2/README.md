# 고등부 찬양팀 운영 사이트 v2

기존 운영 사이트와 분리해 다시 만드는 Next.js + Supabase 기반 내부 운영 도구입니다. 현재 **조 편성·출결·등단 배정과 등단표**까지 구현되어 있습니다.

## 현재 구현 범위

- 로그인 전 개인정보가 없는 공개 랜딩
- Supabase Google OAuth 로그인과 세션 쿠키 갱신
- 역할·상태별 자동 이동
  - 활성 운영자: `/admin`
  - 승인된 조 담당 스탭: `/weeks`
  - 승인 대기·중지: `/pending`
- 운영자의 승인 요청 조회, 스탭 연결, 승인·중지
- 승인 동시 수정 방지를 위한 `expectedRevision`
- Supabase RLS와 서버 측 역할 검사
- 승인 이력 `audit_events` 보존
- 학기 생성과 기간 내 토요일 모임 자동 생성
- 활성 학기 전환, 휴강과 임시 모임 설정
- 학생 기본 정보와 학기별 정보 분리 저장
- 학생·스탭 직접 등록 및 CSV/XLSX 가져오기
- 가져오기 전 열 매핑, 오류 행, 동명이인 검토
- 가져온 원본 파일을 private Supabase Storage에 보존
- 조 담당 스탭의 한 줄 주차 목록과 주차 상세
- 1주차 모임 운영 가이드, 이후 주차 준비 중 화면
- 조건 기반 학생 자동 조 편성, 스탭 수동 배정, 수동 수정 경고
- 자동 초안·수동 수정본·확정본을 보존하는 조 편성 버전
- 학기 전체 출결표, 담당 조 수정 권한, 휴강 잠금, 셀 단위 낙관적 저장
- 토요 출결과 이전 확정본을 사용하는 1·2부 등단 자동 배정
- 공통 부서 이동·무조건 등단 특이사항, 스탭 참석 및 주일 역할
- 마우스·터치·키보드 등단표 드래그와 PNG·PDF 내보내기
- 등단 자동 초안·수동 수정본·확정본 및 무시한 경고 이력
- 운영자 기본 허용 이메일
  - `andew423@gmail.com`
  - `bundangwoorihighpraise@gmail.com`

기존 운영 데이터는 아직 가져오지 않았습니다.

## 로컬 실행

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

환경 변수:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3100
SUPABASE_PROJECT_ID=Supabase 프로젝트 ref
```

환경 변수가 없어도 랜딩 UI는 실행되며, 로그인 대신 설정 안내가 표시됩니다.

## Supabase 준비

1. 새 Supabase 프로젝트를 한국 사용자가 접근하기 가까운 리전에 생성합니다.
2. 아래 마이그레이션을 파일명 순서대로 적용합니다.
   - `supabase/migrations/202609020001_phase1_auth.sql`
   - `supabase/migrations/202609020002_phase2_terms_people.sql`
   - `supabase/migrations/202609040003_grouping.sql`
   - `supabase/migrations/202609040004_attendance.sql`
   - `supabase/migrations/202609040005_stage.sql`
   - `supabase/migrations/202609040006_fix_stage_snapshot.sql`
3. Authentication → Providers → Google을 활성화합니다.
4. Google OAuth 클라이언트의 승인된 리디렉션 URI에 Supabase가 안내하는 callback URL을 등록합니다.
5. Supabase Authentication → URL Configuration에 아래 주소를 추가합니다.
   - Site URL: 실제 Vercel 주소
   - Redirect URLs: `http://localhost:3100/auth/callback`, `https://YOUR_DOMAIN/auth/callback`
6. JWT/세션 설정에서 최대 세션 수명을 180일 이내로 설정합니다. 계정이 중지되면 RLS와 서버 권한 검사가 즉시 모든 운영 데이터 접근을 막습니다.

마이그레이션 적용 후 `/admin/terms`에서 학기를 만들고 `/admin/people?termId=...`에서 승인 연결에 사용할 스탭을 등록합니다. 이후 Supabase access token이 설정된 터미널에서 `npm run db:generate`를 실행해 `src/types/database.ts`를 최신 스키마로 생성합니다.

## 운영 준비 및 사용 순서

1. `/admin/terms`에서 학기명, 시작일, 종료일을 입력합니다.
2. 바로 운영할 학기라면 `활성 학기`로 생성합니다. 활성 학기는 한 개만 유지됩니다.
3. 생성된 학기에서 자동 생성된 토요일을 확인하고 휴강·임시 모임을 설정합니다.
4. `학생·스탭 DB 열기`에서 직접 입력하거나 CSV/XLSX 파일을 선택합니다.
5. 열 매핑과 오류·동명이인 경고를 검토한 뒤 가져오기를 확정합니다.
6. 조 담당 스탭 계정은 운영자의 승인을 받은 뒤 `/weeks`에서 활성 학기의 주차 목록을 확인합니다.
7. 학기 개요의 `조 편성`에서 조건을 저장하고 자동 초안을 만든 뒤 스탭을 배정해 확정합니다.
8. `출결 관리`에서 조를 선택하고 학기 전체 출결을 입력합니다. 조 담당 스탭은 연결된 조만 수정할 수 있습니다.
9. `등단 편성`에서 스탭 참석·역할과 특이사항을 입력하고 자동 배정안을 만듭니다.
10. 이름을 드래그해 역할·좌우·순서를 수정한 뒤 수동 수정본을 저장하고 확정합니다.
11. 실제 등단자와 인도자만 포함한 PNG 또는 PDF를 내려받습니다.

## 마이그레이션 적용 순서

이미 1·2단계 SQL을 적용한 Supabase 프로젝트라면 SQL Editor에서 아래 네 파일을 차례대로 실행합니다.

1. `202609040003_grouping.sql`
2. `202609040004_attendance.sql`
3. `202609040005_stage.sql`
4. `202609040006_fix_stage_snapshot.sql`

각 파일이 성공한 뒤 다음 파일을 실행해야 합니다. 네 파일 적용 전에는 새 조·출결·등단 화면이 완전하게 동작하지 않습니다.

DB 타입 생성에는 Supabase CLI 로그인이 필요합니다.

```bash
supabase login
SUPABASE_PROJECT_ID=rxqzfrdvyrtzblmwkcgc npm run db:generate
```

## Vercel 배포

1. 이 디렉터리를 별도 Git 저장소 또는 모노레포의 배포 루트로 연결합니다.
2. 위 환경 변수들을 Preview와 Production에 각각 등록합니다.
3. Preview URL을 Supabase Redirect URLs에 먼저 등록한 뒤 로그인 흐름을 검수합니다.
4. 검수가 끝나면 Production 도메인을 Site URL과 Google OAuth 설정에 반영합니다.

## 검증

```bash
pnpm lint
pnpm test
pnpm build
```

## 보안 원칙

- 인증 전에는 학생·스탭·주차 데이터를 반환하지 않습니다.
- 브라우저에는 Supabase publishable key만 사용합니다. service role key를 추가하지 않습니다.
- RLS와 서버 측 역할 검사를 동시에 적용합니다.
- 출결 원본은 담당 조만 읽고 수정할 수 있으며, 등단 계산에는 권한 검사를 거친 최소 출결 필드 전용 함수를 사용합니다.
- 운영 데이터는 로그와 테스트 픽스처에 포함하지 않습니다.
- 스키마 변경은 마이그레이션으로만 실행합니다.
