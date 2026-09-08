// 홈페이지 Supabase 데이터를 플랫폼 DB와 분리해 관리한다.
import { DatabaseManagementPage } from '../database/page';

export default function HomepageDatabaseManagementPage() {
  return <DatabaseManagementPage source="homepage" />;
}
