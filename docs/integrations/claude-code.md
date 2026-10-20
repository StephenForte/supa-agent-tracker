# Claude Code setup

Verified: Not yet verified

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into private client configuration. Never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md).

Prefer Copy Claude Code command on the one-time token reveal. It runs claude mcp add with --transport http, --scope user, the server URL, and an Authorization bearer header. Choose All my projects (including future ones) or specific projects when issuing the token.

Use --scope user. Without it, claude mcp add can write a project-scoped .mcp.json (--scope project), and that file would be committed with the token in it. User scope stores the server in ~/.claude.json for all of your projects and keeps the token out of the repository. This command is from the Claude Code MCP docs and has not been run against production.

Paste the base prompt, or Copy prompt for this project on this page, into the Claude Code session.

```text
claude mcp add --transport http --scope user supa-agent-tracker https://<your tracker host>/mcp --header "Authorization: Bearer <YOUR_TOKEN>"
```

`--scope user` is required in this snippet. Claude Code's docs describe three scopes: `local` (default, this project only, `~/.claude.json`), `user` (all of your projects, still `~/.claude.json`), and `project` (writes `.mcp.json` in the project root, which is shared through version control). Project scope would commit the bearer token. User scope does not.

## Evidence and sources

Not yet verified against production. Vendor sources (read 2026-10-20):

- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code MCP quickstart](https://code.claude.com/docs/en/mcp-quickstart)
