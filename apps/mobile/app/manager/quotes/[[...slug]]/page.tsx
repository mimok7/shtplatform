import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ slug?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toQueryString(input?: Record<string, string | string[] | undefined>): string {
  if (!input) return '';
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'undefined') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, value);
    }
  }

  const s = qs.toString();
  return s ? `?${s}` : '';
}

export default async function ManagerQuotesCompatPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const slug = resolvedParams.slug?.join('/') ?? '';
  const basePath = slug ? `/quotes/${slug}` : '/quotes';

  redirect(`${basePath}${toQueryString(resolvedSearchParams)}`);
}
