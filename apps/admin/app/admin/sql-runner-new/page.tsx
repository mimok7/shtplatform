import { redirect } from 'next/navigation';

// 정식 SQL 실행 페이지는 /admin/sql-runner 에 존재합니다. 이 경로는 호환용 리다이렉트입니다.
export default function SqlRunnerNewRedirect() {
  redirect('/admin/sql-runner');
}


