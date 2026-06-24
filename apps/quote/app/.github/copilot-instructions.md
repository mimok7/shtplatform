# Copilot Instructions for AI Agents

# AGENTS.md

Behavioral guidelines for Codex and other coding agents. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## Codex Notes

Codex reads `AGENTS.md` before doing work. Put this file at the project root for repository-wide guidance, or in a nested directory for narrower rules.

Keep this file short and concrete. Codex combines global and project instructions, and large instruction files can crowd out useful task context.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Workspace Evidence Before Edits

**Inspect the actual files you will touch. Don't rely on memory or stale summaries.**

Before changing code:
- Use `rg` or project tools to find the relevant implementation.
- Read the exact files and nearby call sites before editing them.
- Treat open editor tabs, filenames, READMEs, and prior conversation summaries as hints, not proof.
- If local code disagrees with your assumption, trust the code and update the plan.

This is not a new "small change" rule. It exists to prevent confident edits based on imagined code.

## 6. Respect The Worktree

**Assume uncommitted changes belong to the user unless you made them.**

When the worktree is dirty:
- Do not revert, overwrite, or reformat unrelated changes.
- If user changes touch the same files, read them and adapt.
- If unrelated files are dirty, ignore them.
- Never run destructive git commands unless the user explicitly asked for them.

## 7. No Closing Colons (Korean Output)

**End Korean sentences with a period, not a colon.**

When the user writes in Korean, your output is also Korean:
- Don't end Korean sentences with `:` even if the next line is a list or example.
- LLMs trained on English docs leak the colon habit into Korean. Catch it.
- The test: every Korean sentence terminator should be `.`, `?`, or `!`, not `:`.
- Colons are fine inside code, key-value pairs, timestamps, or labels. Not as Korean sentence enders.

## 8. File Header Comments in Korean

**First line of every new source file: a one-line Korean comment stating its role.**

When creating a new source file:
- TypeScript/JavaScript: `// 사용자 인증 상태를 관리하는 Context Provider`
- Python: `# KIS API 호출을 비동기로 래핑하는 클라이언트`
- SQL: `-- 일별 집계 결과를 저장하는 머티리얼라이즈드 뷰`
- Place it directly under required directives (`'use client'`, `'use server'`, shebang).
- Skip config files (`*.config.ts`, `package.json`, lockfiles, generated files).

Why: agents read files selectively, not whole codebases. A one-line Korean header gives instant context so the next session can navigate without re-reading everything.

## 9. Plan + Checklist + Context Notes

**Before any non-trivial task, produce three artifacts. Don't start coding without them.**

- **Plan** - what we're building and why.
- **Checklist** (`checklist.md`) - concrete tasks as checkboxes. Tick as you go.
- **Context Notes** (`context-notes.md`) - decisions made during the work and the reasoning behind them. Append continuously.

If the user gives only a plan and asks you to start coding, stop and ask: "Should I create the checklist and context notes first?" The next session needs the notes to pick up without re-deriving every decision.

## 10. Run Tests Before Marking Complete

**If you touched code, run the relevant tests before saying "done".**

- `npm test`, `pytest`, `cargo test`, or whatever the project uses - run the smallest relevant check first, then broader checks when risk is high.
- If tests pass, report the exact command.
- If tests fail, read the actual error, fix it, and re-run.
- If no test setup exists, verify the project builds or typechecks.
- If you cannot run verification, say exactly why.

This is the step coding agents skip most often. Treat it as non-negotiable.

## 11. Verification Evidence In The Final Reply

**Report what you actually verified, not what you intended to verify.**

Final responses should include:
- The command or check that ran, such as `npm test` or `npx tsc --noEmit`.
- The result, such as "passed", "failed with X", or "not run because Y".
- Any remaining risk the user should know about.

Do not write "done", "fixed", or "works" unless that claim is backed by a concrete check.

## 12. Semantic Commits

**Commit when one logical change is complete. Don't wait for the user to ask.**

- The test: "Can I describe this commit in one sentence?" If yes, commit. If no, the changes are still mixed - split them.
- Good: "auth 미들웨어 추가". Bad: "auth 추가하고 UI도 고치고 버그도 수정" (split into 3).
- Don't accumulate unrelated edits and lose the ability to roll back individually.
- Don't commit just to commit - meaningful units only.
- If the environment or user workflow does not allow commits, keep changes uncommitted and clearly summarize them.

Note: For solo prototypes or throwaway scripts, group commits loosely if it slows you down. The point is reversibility, not ceremony.

## 13. Read Errors, Don't Guess

**Read the actual error/log line. Don't pattern-match from memory.**

When something fails:
- Read the full error message and stack trace.
- Check the actual log output, not what you assume it should say.
- Don't apply a "common fix" before confirming the cause.
- If unclear, add a print/log to verify state - then fix.

This is the step coding agents skip most often after "run tests". They guess from error keywords and apply the most recent pattern. That's how a one-line bug becomes a three-file refactor.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, verification is reported with exact checks, and clarifying questions come before implementation rather than after mistakes.


## 프로젝트 개요
- **스테이하롱 예약 시스템**: 네이버 자유여행 카페 회원을 위한 견적/예약 관리 웹앱입니다.
- **Next.js App Router** 구조를 사용하며, 주요 경로는 `app/` 폴더 하위에 각 기능별로 분리되어 있습니다.
- **Supabase**를 백엔드로 사용하여 인증, 데이터베이스 연동, 사용자 관리, 견적/예약 데이터 CRUD를 처리합니다.

## 주요 구조 및 컴포넌트
- `app/layout.tsx`: 전체 레이아웃, 헤더/메인 구조, 글로벌 스타일 적용.
- `app/page.tsx`: 메인 홈, 로그인 상태에 따라 안내/네비게이션 제공.
- `app/quote/`, `app/admin/quotes/`, `app/mypage/` 등: 견적 생성, 수정, 조회, 관리 기능별로 폴더 분리.
- **동적 라우팅**: `[id]`, `[new_id]` 등 폴더명으로 견적/예약 상세, 수정, 신규 생성 등 처리.
- **재사용 폼**: `QuoteForm` 등 입력 폼 컴포넌트는 여러 경로에서 재사용.

## 데이터 및 인증
- **Supabase**: `@/lib/supabase`에서 인스턴스 import, `supabase.auth.getUser()`로 인증 상태 확인.
- 주요 테이블: `quote`, `quote_price_summary`, `quote_room`, `quote_car`, `users` 등.
- 관리자 권한 체크: `users.role`이 `admin`인지 확인 후 접근 제어.

## 개발/운영 워크플로우
- **빌드/실행**: (명시적 스크립트 파일 없음, 일반적으로 `next dev`, `next build`, `next start` 사용)
- **환경 변수**: `.env` 파일 필요 (Supabase 키 등), 실제 파일은 미포함.
- **이미지/스타일**: `/public/images/`, `/styles/globals.css` 등에서 관리 (경로만 확인됨, 실제 파일 미포함).

## 코드 패턴 및 관례
- **'use client'**: 클라이언트 컴포넌트에 명시적으로 선언.
- **라우터**: `useRouter`, `useParams` 등 Next.js 훅 적극 사용.
- **상태 관리**: 주로 `useState`, `useEffect`로 로컬 상태/비동기 처리.
- **경고/리다이렉트**: 인증/권한 오류 시 `alert` 후 `router.push()`로 이동.
- **테이블 조인**: Supabase의 `.select('*, 관계테이블(*)')` 패턴으로 연관 데이터 한 번에 조회.

## 예시
- 견적 상세 조회: `quote`, `quote_price_summary`, `users`, `quote_room`, `quote_car`를 조인하여 한 번에 조회.
- 관리자 페이지: 로그인/권한 체크 후 미승인 견적만 필터링.
- 폼 재사용: 신규/수정/복사 등에서 동일 폼(`QuoteForm`) 활용.

## 참고/확장
- 외부 패키지, 커스텀 훅, 유틸 등은 현재 코드베이스에 명시적 존재 없음. 필요시 직접 생성/추가.
- 추가적인 빌드/테스트/배포 스크립트는 별도 파일에서 관리되지 않음.

---

이 문서는 AI 코딩 에이전트가 본 프로젝트에서 즉시 생산적으로 작업할 수 있도록 핵심 구조와 관례를 요약합니다. 추가 정보가 필요하면 실제 코드/폴더를 직접 탐색해 주세요.
