# P1-A1 remote MCP compatibility research

Research read date: **2026-10-15** (all links below). This is documentary evidence, not a tested-client compatibility claim. No target client was connected during P1-A1. P1-A2 records installed versions, account tier, rollout, and actual results using [the operator script](p1-a-test-plan.md). “Supported” means the cited vendor documents that specific capability. Unknown does not mean unsupported. Row IDs identify the tests and remaining gaps.

## Evidence matrix

| Row | Cursor (editor Agent, local session) | Claude Desktop (macOS, remote connector; Cowork separately) | Grok Bot (x.ai/bot) |
|---|---|---|---|
| R1 Remote MCP | **Supported** — remote URLs documented [C1], read 2026-10-15. | **Supported** — shared remote connector infrastructure explicitly includes Desktop [A1], read 2026-10-15. | **Unknown — needs live test** for an arbitrary remote URL. xAI documents MCP generally [G1], but does not specify remote vs local transport. G-test 1–3 must prove connection. |
| R2 Transports | **Supported** — stdio, Streamable HTTP and legacy SSE [C1], read 2026-10-15. Probe tests HTTP only. | **Supported** — Streamable HTTP and deprecated HTTP+SSE [A1], read 2026-10-15. Local extensions are a distinct path. | **Unknown — needs live test** — no transport contract found in [G1, G2]. G-test 2–3: establish Streamable HTTP or record failure; don't infer parity from Cursor. |
| R3 Auth modes | **Unknown — needs live test** for the complete set: authless and OAuth 2.1+DCR (C-test 2, 5). Pasted Authorization header [C2] and generic OAuth [C1] are documented, read 2026-10-15; generic OAuth does not establish DCR. | **Unknown — needs live test** for pasted bearer on this account and exact OAuth 2.1 interoperability (A-test 2, 5). Authless and OAuth with DCR/CIMD are documented [A2], read 2026-10-15. Vendor describes OAuth 2.0 with S256 PKCE; header availability conflicts below. | **Unknown — needs live test** — authless, pasted headers and OAuth 2.1/DCR for custom MCP (G-test 2, 5). Provider browser logins [G2] do not prove any of those modes for our URL. |
| R4 Configuration / paste token | **Supported** — `.cursor/mcp.json` or `~/.cursor/mcp.json`, `url` plus `headers.Authorization` [C2], read 2026-10-15. | **Unknown — needs live test** for pasted token availability (A-test 2). Documented UI: Customize → Connectors → Add custom connector [A3], read 2026-10-15. Request headers is rollout dependent; OAuth client ID/secret fields are not access-token fields. | **Unknown — needs live test** — arbitrary URL/header entry location (G-test 2). Documented UI is Connect apps → choose plugin → browser authorization [G2], read 2026-10-15; no documented mcp.json path for Grok Bot found. |
| R5 Subagent tool inheritance | **Supported** — local subagents inherit MCP tools [C3], read 2026-10-15. Cloud subagents use team configuration instead. Validate the installed build with C-test 4. | **Unknown — needs live test** — Cowork documents parallel subagents [A4], but not connector inheritance; ordinary Chat may not expose delegation. A-test 4 records mode and child call or absence. | **Unknown — needs live test** — inter-Bot collaboration [G1] is not proof of subagent inheritance. G-test 4 checks child delegation if available, then separately a second Bot. |
| R6 Model identity available to agent | **Unknown — needs live test** — hook adapter has `model` / optional `model_id` [C4], read 2026-10-15, but that does not prove the model knows its exact runtime identity. C-test 3 compares echo to hook/UI evidence; omit unknown. | **Unknown — needs live test** — compare model's echo with runtime/UI selection, including subagent (A-test 3–4). ClientInfo identifies a client, not its model. | **Unknown — needs live test** — service manages model selection and has no picker [G3], read 2026-10-15. G-test 3 must accept omitted model unless authoritative runtime evidence exists. |
| R7 Heartbeats without model remembering | **Unknown — needs live test** for periodic liveness (C-test 6). Documented event hooks: session lifecycle, tool events [C4], read 2026-10-15. A lifecycle-managed timer adapter is a proposal, not built-in periodic-heartbeat support. | **Unknown — needs live test** for in-flight periodic liveness (A-test 6). Documented scheduled Cowork tasks run separate model sessions [A5], read 2026-10-15; that does not prove a current run is alive. No Desktop timer-hook contract found in these sources. | **Unknown — needs live test** for active-run liveness (G-test 6). Documented routines/schedules and inbound webhook triggers [G4], read 2026-10-15. Triggering another model run cannot establish the original run's liveness. |
| R8 Observe calls to other tools | **Supported** through client-side `postToolUse` / failure hooks, covering native and MCP tools [C4], read 2026-10-15. Probe alone sees only its calls; C-test 7 measures adapter coverage. | **Unknown — needs live test** — no cross-tool telemetry API documented in these Desktop connector sources. A-test 7 looks for exported events, not model recollection. | **Unknown — needs live test** — no cross-tool telemetry contract found in [G1–G4]. G-test 7 checks export/hook access and coverage. |
| R9 Product/version described | **Supported** documentary snapshot: Cursor editor docs [C1–C4], read 2026-10-15; installed version not tested. C-test 1 captures it. | **Supported** documentary snapshot: Claude Desktop remote connectors plus explicitly labeled Cowork features [A1–A5], read 2026-10-15; build/account not tested. A-test 1 captures them. | **Supported** product identity: x.ai/bot and xAI guide dated 2026-09-11 [G1]; current operational docs [G2–G4] read 2026-10-15. Installed build not tested (G-test 1). |

### Claude fixed-header evidence conflict

The Help Center describes Request headers for individual Pro/Max configuration [A3], and the connector setup page describes full `Bearer <token>` entry [A6]. However, the developer authentication reference explicitly limits static headers to a beta for selected organizations, entered by the Owner and shared across members [A2]. Therefore **do not promise per-user pasted tokens on Claude Desktop**. Record which UI this operator actually has. An organization-wide shared credential also does not establish individual identity for our private-account product; it would require a separate mapping/design. Client version alone may not explain a server-side rollout.

### Grok Bot is not the xAI API or the @grok X account

There is primary-source MCP evidence: xAI's guide says Grok Bot supports Cursor's MCP servers [G1]. That broad compatibility statement does not specify transport, custom URL entry, or bearer/DCR behavior. Its documented operational surfaces include account-wide connected plugins with browser sign-in [G2], inter-Bot workflows [G1], and scheduled routines with incoming webhooks [G4]. The webhook bearer key authenticates an incoming trigger to Grok Bot, not Grok Bot's outgoing requests to our MCP. No separate xAI API tool-calling support is substituted as proof for this product. If custom MCP is inaccessible, return that exact UI gap for planner dispatch; a plugin/adapter is a possible later integration, not an implemented fallback.

## Protocol and probe boundary

Read current MCP **2026-07-28** [M1, M2], including the deprecated HTTP+SSE section. Current Streamable HTTP uses per-request metadata; earlier versions use initialize/sessions. The probe uses the current stable official TypeScript SDK **1.32.1**, as resolved from npm on 2026-10-15, whose `types.js` sets latest protocol **2025-11-25** [S1]. It implements that SDK's initialize-based Streamable HTTP [M3], not full 2026-07-28 protocol semantics. A modern-only client failure remains a real gap; record requested and negotiated versions, never label the probe current-spec compliant. The three documented target configurations do not establish a need for legacy HTTP+SSE, so no legacy endpoint is added. SSE response framing inside Streamable HTTP is a different concept.

Bearer protection is a diagnostic fixed secret, not a full OAuth implementation. HTTP 401 includes a Bearer `WWW-Authenticate` challenge with a protected-resource metadata URL [M2]. Discovery is recorded; the advertised local issuer's metadata deliberately returns 501. This lets an OAuth-only client be observed reaching discovery without inventing a working authorization server. No account issuance, scopes, refresh, DCR, or OAuth success is tested by this probe.

## Proposal for operator and planner (not an auth decision)

Propose **both OAuth and scoped personal bearer tokens**, subject to P1-A2: OAuth for clients/accounts that need sign-in, pasted tokens for clients that support them. Cursor has a documented token path; Claude's header availability and per-user semantics make bearer-only a risky default. OAuth-only would not satisfy the PRD's copy-once token requirement without a planner-approved product change. Both increase implementation and revocation complexity: use the same server-enforced user/project scope and revocation rules regardless of credential source. Do not treat a shared organization header or a client-provided owner field as user identity.

**No auth design is yet demonstrated to satisfy all three clients.** Grok Bot's exact custom-MCP auth path remains unverified. If live tests cannot establish it, propose a separately scoped plugin/adapter path rather than declaring integration complete. The interim probe accepts a single optional bearer or authless traffic and records discovery only.

Single decision question: **After P1-A2, should Phase 1 implement OAuth alongside scoped personal bearer tokens, with a separately dispatched Grok Bot adapter if custom remote MCP cannot be verified?**

## Primary sources (all read 2026-10-15)

- [C1 Cursor MCP](https://cursor.com/docs/mcp)
- [C2 Cursor MCP setup and header example](https://prod.cursor.com/help/customization/mcp)
- [C3 Cursor subagents](https://cursor.com/docs/subagents)
- [C4 Cursor hooks](https://cursor.com/docs/hooks)
- [A1 Claude server/transport support](https://claude.com/docs/connectors/building)
- [A2 Claude authentication reference](https://claude.com/docs/connectors/building/authentication)
- [A3 Claude custom-connector Help Center](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [A4 Claude Cowork and subagents](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [A5 Claude scheduled tasks](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork)
- [A6 Claude request-header setup](https://claude.com/docs/connectors/custom/add-unlisted)
- [G1 xAI Grok Bot 101](https://x.ai/bot/guides/grok-bot-101) (published 2026-09-11)
- [G2 Grok Bot plugin configuration](https://cursor.com/help/grok-bot/connect-plugins)
- [G3 Grok Bot settings and model selection](https://cursor.com/docs/grok-bot/settings)
- [G4 Grok Bot routines and inbound webhooks](https://cursor.com/help/grok-bot/routines)
- [M1 MCP 2026-07-28 Streamable HTTP, backward compatibility and deprecated HTTP+SSE](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [M2 MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [M3 MCP 2025-11-25 transports implemented by the stable SDK](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [S1 Official SDK package source](https://github.com/modelcontextprotocol/typescript-sdk) — exact published package and protocol constants additionally inspected locally in `node_modules/@modelcontextprotocol/sdk/dist/esm/types.js`; see lockfile for integrity/version. No secondary sources used.

## Production verification (P1-G2)

| Client | Date | Version | Result |
|---|---|---|---|
| Cursor (macOS, Agent mode) | 2026-10-16 | 3.25.6 | ✅ `~/.cursor/mcp.json` with `headers.Authorization` (pasted bearer token, project-scoped). 12 tools listed. One agent session ran list_projects → get_project → check_in (coding, task_id) → heartbeat → update_status → list_next_steps → create_next_step → check_out (finished / waiting_for_review, no_pr_reason). Every call was HTTP 200 per Render request logs (UA `Cursor/3.25.6 (darwin arm64)`). The operator confirmed the run (Finished / Waiting for review), the next step and the timeline on the dashboard, with no tool errors in chat. Heartbeat hooks were not tested. |
| Claude Desktop (macOS) | 2026-10-16 | (operator's install) | ✅ Custom connector → No sign in + request header `authorization: Bearer …` (available on this account; documented as a limited beta). 12 tools listed. The same scripted cycle ran with no tool errors. Planner read-only verification via the connector: the next step was created with the Claude run as source_run_id, and the run is no longer running (checked out). Calls come from Anthropic IPs 160.79.106.x (UA `Claude-User`; setup probes `python-httpx`). 401s during setup are expected (OAuth discovery / header not yet set). Two 400s mid-session have an unconfirmed cause (the operator had pasted a malformed token; a bad token normally gives 401) and didn't affect the run. |
| Grok Bot | — | — | pending |

