import React from 'react';

export default function SectionBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="section-box">
      {title && <h3 className="section-title">{title}</h3>}
      <div>{children}</div>
    </section>
  );
}
