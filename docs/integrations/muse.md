# Muse setup

Verified: Production-verified 2026-10-21 (operator, Muse macOS app)

Prerequisites: a token issued for the target project from [Settings → MCP tokens](/settings/tokens) on your tracker, and the full remote server URL `https://<your tracker host>/mcp`. Copy the token once into Muse's masked API Key field. Never paste it into the chat, and never commit it. Read the [base prompt](base-prompt.md) and [reporting protocol](reporting-protocol.md). This guide follows planner decision D-041.

There is no MCP connector screen. Ask the main Muse bot, in chat, to add a remote MCP server. Prefer Copy Muse setup message on the one-time token reveal: it asks Muse to add a server named supa-agent-tracker at this deployment's URL with API key / bearer token auth, and it says the key will be entered in the secure field, not in chat. The message does not include the token. Choose All my projects (including future ones) or specific projects when issuing the token.

Muse collects the token through a masked field labelled "API Key". Choose the API key / bearer token option. The exact wording of Muse's auth-method choices was not recorded. Paste the token only into that field, using the Copy button at the top of the one-time reveal. Do not paste the token into the chat.

Paste the base prompt, or Copy prompt for this project on this page, into Muse. This placement is guidance.

No hook path is known for Muse. Rely on agent heartbeats at natural pauses.

Set harness from runtime knowledge; omit model when unknown. Muse version, hooks, subagent inheritance, model identity, and the harness string Muse reports are not verified.

```text
Please add a remote MCP server named supa-agent-tracker at https://<your tracker host>/mcp. Choose the API key / bearer token option. I will enter the key in the masked "API Key" field, not in this chat.
```

## What's unknown

Muse version, hooks, subagent inheritance, model identity, and the harness string Muse reports are not verified. The tracker accepts only `Authorization: Bearer`. Two production runs succeeded after the operator entered the API Key in the masked field; that the key was sent as a bearer token is inferred from that. The exact wording of Muse's auth-method choices was not recorded, so this guide says "choose the API key / bearer token option" and does not quote a label.

## Evidence and sources

The operator connected Meta Muse to the production tracker by hand. Two Muse runs checked in and reported successfully on 2026-10-21 (Muse macOS app). Planner decision D-041. Vendor source:

- [Introducing Muse, a personal AI agent](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)
