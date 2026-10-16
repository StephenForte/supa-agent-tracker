import {
  listNextStepsForAgent, listNextStepsInput,
  createNextStep, createNextStepInput,
  updateNextStep, updateNextStepInput,
  reorderNextSteps, reorderNextStepsInput,
  setWaitingNote, setWaitingNoteInput,
  type AgentMutation,
} from '../steps/agent-steps.js';
import { ProtocolError } from './protocol.js';
import type { ToolRegistrar } from './registry.js';

function saved<T>(result: AgentMutation<T>): T {
  if (result.status === 'conflict') throw new ProtocolError('conflict', result.current);
  if (result.status === 'idempotency_mismatch') throw new ProtocolError('idempotency_mismatch');
  return result.value;
}

export function registerStepTools(register: ToolRegistrar): void {
  // Agent-steps owns mutation idempotency. Enabling the registrar's layer would nest it.
  register('list_next_steps', listNextStepsInput.shape, false,
    (input, db, ctx) => listNextStepsForAgent(db, ctx.access, input));
  register('create_next_step', createNextStepInput.shape, false,
    async (input, db, ctx) => saved(await createNextStep(db, ctx.access, input)));
  register('update_next_step', updateNextStepInput.shape, false,
    async (input, db, ctx) => saved(await updateNextStep(db, ctx.access, input)));
  register('reorder_next_steps', reorderNextStepsInput.shape, false,
    async (input, db, ctx) => saved(await reorderNextSteps(db, ctx.access, input)));
  register('set_waiting_note', setWaitingNoteInput.shape, false,
    async (input, db, ctx) => saved(await setWaitingNote(db, ctx.access, input)));
}
