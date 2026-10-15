import { instructionSegments } from '../../domain/next-steps/instruction';
import { stopCardActivation } from './stopCardActivation';

export function InstructionText({ instruction }: { instruction: string }) {
  return <div className="[overflow-wrap:anywhere] leading-relaxed">{instructionSegments(instruction).map((segment, index) => {
    if (segment.kind === 'code') return <code key={index} className="rounded bg-[#e7edf1] px-1 font-mono text-[0.95em]">{segment.text}</code>;
    if (segment.kind === 'link') return <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer" onClick={stopCardActivation} onMouseDown={stopCardActivation}>{segment.text}</a>;
    return <span key={index}>{segment.text}</span>;
  })}</div>;
}
