import type { ReactNode } from 'react';
export function Placeholder({ title, owner, children }: { title: string; owner: string; children?: ReactNode }) { return <><p className="eyebrow">Phase 0 foundation · {owner}</p><h1>{title}</h1><p className="lede">This route is ready for its screen implementation.</p>{children}</>; }
