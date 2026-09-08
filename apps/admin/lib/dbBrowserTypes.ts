// 관리자 DB 도구의 브라우저·서버 공용 메타데이터 타입을 정의한다.
export type DbColumn = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  identity_generation: string | null;
  ordinal_position: number;
};
