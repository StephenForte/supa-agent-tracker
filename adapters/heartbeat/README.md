# Heartbeat hook adapter

Requires Node 24+ only; no install or dependencies. Copy `heartbeat.mjs` to a stable local path (not a disposable worker clone), and run `node /ABSOLUTE/PATH/heartbeat.mjs` from the agent workspace root. It never consumes argv or hook stdin. See [Cursor wiring](../../docs/integrations/cursor.md); no known Desktop/Grok hook path is claimed.

## Private environment

Create an env file outside the repository, restrict it **before** entering a token:

```sh
umask 077
touch /ABSOLUTE/PRIVATE/supa-heartbeat.env
chmod 600 /ABSOLUTE/PRIVATE/supa-heartbeat.env
```

Edit it locally (never through chat or a shell command containing a real token):

```dotenv
SUPA_MCP_URL=https://<your tracker host>/mcp
SUPA_MCP_TOKEN=<YOUR_TOKEN>
# Optional; default is .supa/run-id relative to the hook working directory
SUPA_RUN_ID_FILE=/ABSOLUTE/WORKSPACE/.supa/run-id
```

Invoke with `node --env-file=/ABSOLUTE/PRIVATE/supa-heartbeat.env /ABSOLUTE/PATH/heartbeat.mjs`. The Node binary and env-file must exist: Node launcher/configuration failures happen before this script and cannot be caught by it. Never commit env files or tokens, and never put the token in argv, URL queries, hooks.json or prompts. HTTPS is required except loopback HTTP for local tests. Redirects and URL userinfo are rejected. Keep `.supa/` files out of version control using the workspace's local `.git/info/exclude`.

## Handoff and behavior

The agent writes only the checked-in run ID to `.supa/run-id`. Missing/empty file: exit 0, no network. Use a separate file and hook environment per concurrent run; a shared workspace file cannot route subagent events. Delete the file after confirmed check-out only if it still contains the same run.

Each invocation sends at most one heartbeat attempt per 60 seconds per run ID. SHA-256-named timestamp and exclusive lock files live next to the run-id file; attempts (including failures) reserve a timestamp before sending. Concurrent hooks are serialized; normal completion and the ten-second deadline remove the owned lock. SIGTERM, SIGINT and SIGHUP also release it, print `supa heartbeat: interrupted` and exit 0. A later invocation reclaims a lock older than 30 seconds (well past the ten-second deadline), recovering automatically after SIGKILL or a crash; younger locks still throttle. Reclamation can race with another hook, but a duplicate heartbeat is harmless and does not change the run revision. Retain timestamps when retrying within a minute; remove old artifacts only after ending the run. State stays local, with no token stored. An unwritable directory fails closed to network traffic, while the script still exits 0.

The script initializes an MCP session, sends notifications/initialized, calls heartbeat with a fresh UUID request_id, then DELETEs the session best-effort. Every request uses bearer auth and the required Accept header, with no Origin header. A nine-second abort and ten-second process deadline bound the entire invocation, including cleanup. It emits one fixed status line on stderr, nothing on stdout, and always exits 0; errors never include URL, token, response body or exception text. Failed attempts are not queued; the next eligible hook tries again with a new ID. It creates no run and reports no status or tool telemetry. Heartbeats preserve run revision and cannot reopen ended executions.

This is an event hook, not a daemon or periodic timer. No tool activity means no guaranteed heartbeat. Prompt-based clients and unsupported concurrent hook routing must call heartbeat themselves at natural pauses. The agent, not this script, owns lifecycle reports, pending mutation retries and checkout tool aggregates. Production client verification remains P1-G2.
