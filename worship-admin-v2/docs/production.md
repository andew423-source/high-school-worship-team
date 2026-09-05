# 정식 운영

- 공유 주소: https://woori-high-praise.vercel.app
- Vercel 프로젝트: woori-high-praise
- GitHub: andew423-source/high-school-worship-team (비공개)
- 배포 브랜치: main
- Root Directory: worship-admin-v2

## 업데이트

1. 앱 디렉터리에서 `pnpm check`로 lint, 단위 테스트, 빌드를 통과시킵니다.
2. 환경변수, 원본 명단, 빌드 산출물이 커밋에 없는지 확인합니다.
3. 검토한 코드만 main에 push합니다. Vercel Git 연결이 배포를 시작합니다.
4. Deployments에서 해당 커밋이 Ready인지 확인하고 공유 주소에서 로그인과 필요한 화면을 점검합니다.

환경변수는 Vercel에서 관리하며 `.env.local`은 커밋하지 않습니다. Supabase 인증의 Site URL은 공유 주소, Redirect URLs에는 실제 `/auth/callback` 주소를 허용해야 합니다. 로컬 테스트 주소를 운영 기본 주소로 사용하지 않습니다.

## 데이터 보호와 복구

코드 배포는 기존 학생·스탭·출결·등단 데이터를 초기화하지 않습니다. DB 변경은 supabase/migrations의 순서 있는 SQL로 별도 적용합니다. 202609050007은 등단 제외 특이사항을 추가한 마이그레이션입니다. 이미 적용한 SQL을 임의로 다시 실행하지 않습니다.

코드 장애 시 이전 정상 Vercel 배포로 rollback할 수 있습니다. 코드 rollback은 DB를 되돌리지 않습니다. 스키마 변경 전에는 별도 DB 백업과 복구 절차를 확인해야 합니다. 자동 백업 주기와 복원 가능 여부는 Supabase 요금제 및 프로젝트 설정에서 별도로 확인하세요.

`tests/stage-database-smoke.sql`은 실제 DB 권한이 필요한 트랜잭션 롤백 검증입니다. 일반 단위 테스트에 포함되지 않습니다. `db:generate`도 Supabase CLI 인증이 필요합니다.
