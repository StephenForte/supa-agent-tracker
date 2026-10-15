import type { ToolAggregate } from './types';
export const formatNullable = (value: string | number | null | undefined): string => value == null ? '—' : String(value);
export const formatIdentity = (value: string | null | undefined): string => value?.trim() || 'Unknown';
export function formatTimestamp(value: string | null, timeZone?: string): string {
  return value === null ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
}
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
}
export function formatToolTelemetry(tools: readonly ToolAggregate[] | null): string {
  return tools === null ? 'No telemetry reported' : `${tools.reduce((sum, tool) => sum + tool.callCount, 0)} calls reported`;
}
