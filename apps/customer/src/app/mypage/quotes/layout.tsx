import { redirect } from 'next/navigation';

export default function QuotesHiddenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  redirect('/mypage');
}
