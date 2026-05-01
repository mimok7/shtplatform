"use client";

import Link from "next/link";

export default function ServiceCard({
  href,
  title,
  subtitle,
  icon,
  color = "from-blue-500 to-cyan-500",
  features = [] as string[],
}: {
  href: string;
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  features?: string[];
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl shadow-xl overflow-hidden hover:shadow-2xl transition-all transform hover:scale-105"
    >
      <div className={`h-20 bg-gradient-to-r ${color} relative`}>
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute bottom-4 left-6 flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <span className="text-white font-bold text-lg">{title}</span>
        </div>
      </div>
      <div className="p-8">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{subtitle}</h3>
        <div className="flex flex-wrap gap-2 mb-6">
          {features.map((f, i) => (
            <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
              {f}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-blue-500 font-medium group-hover:text-blue-600">자세히 보기 →</span>
        </div>
      </div>
    </Link>
  );
}
