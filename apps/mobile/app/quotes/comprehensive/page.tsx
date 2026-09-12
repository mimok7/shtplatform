import { redirect } from 'next/navigation';

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toQueryString(input?: Record<string, string | string[] | undefined>): string {
  if (!input) return '';
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'undefined') continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, value);
  }

  const result = query.toString();
  return result ? `?${result}` : '';
}

// 모바일에는 별도 전체 편집 화면 대신, 전체 상품을 표시하는 기존 견적서 화면으로 연결한다.
export default async function MobileComprehensiveQuotePage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  redirect(`/quotes/cruise${toQueryString(resolvedSearchParams)}`);
}
