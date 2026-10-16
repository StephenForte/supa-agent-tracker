import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { CredentialAccess, Database, Transaction } from '../repo/access.js';
import { withIdempotency } from '../repo/idempotency-keys.js';
import { failure, ProtocolError, requestHash } from './protocol.js';

export interface ToolContext { access: CredentialAccess; userAgent: string | null; clientInfo: unknown }
export interface ToolDependencies { db: Database; context: () => ToolContext }
export type ToolRegistrar = <S extends z.ZodRawShape>(name: string, shape: S, mutate: boolean,
  operation: (input: z.infer<z.ZodObject<S>>, tx: Database, ctx: ToolContext) => Promise<unknown>) => void;

/** One registry owns safe validation, auth context, idempotency and error mapping for all tool groups. */
export function createToolRegistrar(server: McpServer, deps: ToolDependencies): ToolRegistrar {
  const handlers = new Map<string, (raw: unknown) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>>();
  function register<S extends z.ZodRawShape>(name: string, shape: S, mutate: boolean,
    operation: (input: z.infer<z.ZodObject<S>>, tx: Database, ctx: ToolContext) => Promise<unknown>) {
    const schema = z.strictObject(shape);
    const handler = async (raw: unknown) => {
      try {
        const input = schema.parse(raw ?? {});
        const ctx = deps.context();
        let response: unknown;
        if (mutate) {
          const result = await withIdempotency(deps.db, ctx.access, (input as { request_id: string }).request_id,
            requestHash({ tool: name, input }), (tx: Transaction) => operation(input, tx, ctx));
          if (result.status === 'idempotency_mismatch') throw new ProtocolError(result.status);
          response = result.response;
        } else response = await operation(input, deps.db, ctx);
        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
      } catch (error) { return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(failure(error)) }] }; }
    };
    handlers.set(name, handler);
    server.registerTool(name, { description: name.replaceAll('_', ' '), inputSchema: shape as z.ZodRawShape }, handler);
    // Override only the SDK dispatch wrapper: its default validation errors echo raw arguments.
    // SDK still publishes and negotiates each registered schema through tools/list.
    server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const call = handlers.get(request.params.name);
      return call ? call(request.params.arguments) : { isError: true, content: [{ type: 'text', text: JSON.stringify(failure(new ProtocolError('not_found'))) }] };
    });
  }
  return register;
}
