# 점검 지침: 성능향상 / 콘솔 / 네트워크 / 오류수정

목적: 서비스 운영 중 발생하는 콘솔 오류, 네트워크 문제, 성능 병목을 빠르고 재현 가능하게 점검하고 수정하기 위한 표준 절차와 즉시 실행 가능한 명령 모음

사전 준비
- 필수 도구: Chrome(DevTools), `curl`(Windows 내장 가능), `ping`, PowerShell, Node.js/npm (선택적), `npx` (선택적)
- 권장: Lighthouse CLI (`npm i -g lighthouse` 또는 `npx lighthouse`), ngrok (외부 접근 테스트)
- 금지: `npm run build` 및 타입체크(`npm run typecheck`, `tsc`) 실행 금지 (프로젝트 규칙)

빠른 워크플로(요약)
- 1) 재현 환경 수집: URL, 사용자, 브라우저 버전, 발생 시간
- 2) 콘솔 로그 확인: DevTools -> Console 필터링(Errors / Warnings)
- 3) 네트워크 요청 확인: DevTools -> Network, `curl -I`로 응답 헤더/상태 확인
- 4) 성능 스냅샷: Lighthouse 또는 DevTools Performance 측정
- 5) 변경 시나리오 적용 및 재검증

1. 콘솔 오류 점검 절차
- 재현성 확보: 같은 환경(브라우저, 네트워크)에서 재현 확인
- 콘솔 필터: Errors / Warnings 만 표시하여 잡음 제거
- 스택 추적(Stack trace) 수집: 오류 클릭 → 소스 파일과 줄번호 확인
- 원인 분류:
  - Syntax / ReferenceError: 코드 로딩 문제 — 번들 또는 모듈 경로 확인
  - TypeError / Undefined: 데이터 흐름, null guard 확인
  - CORS 관련 오류: 응답 헤더와 프리플라이트 확인
- 우선 조치: 재현 스크립트·테스트 케이스 생성, 임시 패치(try/catch 또는 guard)로 서비스 영향 최소화

2. 네트워크 요청 점검 절차
- 상태 코드 점검: 2xx / 3xx / 4xx / 5xx 분류
- 응답 헤더 확인: Cache-Control, Content-Type, CORS 관련 헤더
- 응답 시간 측정: DevTools Network의 timing 및 `curl --write-out` 옵션
- 요청 페이로드 확인: 불필요한 대용량 전송 여부 확인
- 재시도·타임아웃 정책 확인: 클라이언트와 서버의 타임아웃 일치 여부

3. 성능 향상 체크리스트
- Lighthouse 점수(권장 자동화): Performance, FCP, LCP, TBT, CLS 체크
- 번들 크기: 주요 entry의 번들과 서드파티 라이브러리 크기 확인
- 이미지/미디어: 적절한 포맷, 사이즈, lazy-loading 적용
- 네트워크: HTTP/2 적용 여부, gzip/brotli 압축 확인
- 서버 응답 시간: TTFB, 백엔드 쿼리 최적화, 캐시 전략 확인
- 캐시: CDN, 브라우저 캐시, ISR/SSR 캐시 정책 검토

4. 우선순위·롤백 가이드
- 우선순위: Blocker(서비스불가) > Critical(주요 기능 손상) > Major > Minor
- 긴급 수정 시: Hotfix 브랜치 생성 → 최소 범위 패치 → 로그 모니터링 → 점진 배포
- 롤백: 변경 전 스냅샷/릴리스로 되돌리기, DB 변경이 동반된 경우 별도 롤백 스크립트 필요

5. 검증·보고서 템플릿
- 기본 항목: 재현 단계, 영향 범위, 로그(콘솔,서버), 네트워크 캡처, 변경 내역, 검증 결과
- 저장: 이슈 트래커 또는 공유 드라이브에 원본 스크린샷/레포트 첨부

6. 즉시 실행 가능한 명령 모음 (복사하여 사용)
- HTTP 헤더 확인:
```
curl -I -L <URL>
```
- 응답 시간 상세(일부 curl 구현에서 지원):
```
curl -o NUL -s -w "time_namelookup: %{time_namelookup}\ntime_connect: %{time_connect}\ntime_starttransfer: %{time_starttransfer}\ntime_total: %{time_total}\n" <URL>
```
- 간단한 네트워크 재현(호스트 ping):
```
for /f "tokens=3 delims=/" %%a in ("<URL>") do set HOST=%%a
ping -n 4 %HOST%
```
- Lighthouse(설치되어 있을 때):
```
lighthouse <URL> --output html --output-path=lh-report.html
# 또는
npx lighthouse <URL> --output html --output-path=lh-report.html
```

7. 실행 스크립트 템플릿
- 작업공간에 제공되는 `scripts/run_checks.bat`를 사용하면 기본 네트워크/헤더/타이밍 및 Lighthouse(설치시)를 자동 실행합니다. (Windows)

8. 유지보수 및 확장 아이디어
- CI에 Lighthouse/네트워크 스모크 테스트 추가
- 에러 맵핑 테이블(자주 발생하는 콘솔 메시지와 권장 조치) 유지
- 주기적인 번들 분석 및 서드파티 라이브러리 정리

문의: 이 지침을 기준으로 특정 오류 케이스(콘솔 메시지, 엔드포인트 URL)를 주시면, 그에 맞춘 빠른 대응 패치를 만들어 드리겠습니다.
