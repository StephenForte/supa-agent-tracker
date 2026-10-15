import type { ReactNode } from 'react';
import type { ExecutionState, Lifecycle, WorkStatus } from '../../domain/types';
export type BadgeTone = ExecutionState | WorkStatus | Lifecycle | 'stale' | 'neutral';
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
