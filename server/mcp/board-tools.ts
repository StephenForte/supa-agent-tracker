import * as board from '../board/agent-board.js';
import { listInput, postInput, resolveInput, stateInput } from '../board/inputs.js';
import type { AgentMutation } from '../steps/agent-steps.js';
import { ProtocolError } from './protocol.js';
import type { ToolRegistrar } from './registry.js';
function saved<T>(result: AgentMutation<T>): T {
  if (result.status === 'conflict') throw new ProtocolError('conflict', result.current);
  if (result.status === 'idempotency_mismatch') throw new ProtocolError('idempotency_mismatch');
  return result.value;
}
export function registerBoardTools(register: ToolRegistrar): void {
  // The service owns idempotency; do not nest the registrar's mutation wrapper.
  register('list_board', listInput.shape, false, (input, db, ctx) => board.listBoard(db, ctx.access, input));
  register('post_board_message', postInput.shape, false, async (input, db, ctx) => saved(await board.postMessage(db, ctx.access, input)));
  register('set_board_state', stateInput.shape, false, async (input, db, ctx) => saved(await board.setState(db, ctx.access, input)));
  register('resolve_board_entry', resolveInput.shape, false, async (input, db, ctx) => saved(await board.resolveEntry(db, ctx.access, input)));
}
