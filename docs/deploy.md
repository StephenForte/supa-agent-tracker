# Deploying the Phase 0 demo

> **Retired 2026-10-18.** The static site `supa-agent-tracker` was removed from `render.yaml` and then deleted in the Render dashboard (a Blueprint change never deletes a resource). Production is the Phase 1 web service in [Deploying Phase 1](ops/deploy-phase1.md). This page is kept as the record of the Phase 0 procedure. The demo build itself (`npm run build`, D-028) still exists for local use and tests.

The shell is a **demo with simulated data and no backend**. Render serves the Vite production build as a static site. Nothing in this repository provisions the service, stores credentials, or talks to GitHub, Postgres, or an MCP host.

Creating the Render service is a separate step, done after this configuration is on `main`, with the operator's approval. This document is that procedure. It does not mean a site is already live. Phase 1 (paid web service and Postgres) is specified in [Deploying Phase 1](ops/deploy-phase1.md) and stays unmerged until the operator approves the cost gate.

## What gets deployed

`npm run build` writes a static single-page app to `dist/`. Render's CDN serves those files. The browser then renders every route. There is no Node server in production, no `startCommand`, and no environment variables.

Mock state stays in the browser (`localStorage` key `supa-agent-tracker:demo:v1`). A redeploy does not carry a visitor's demo edits, and it does not clear them either: that data never leaves the browser. **Reset demo** restores the seed on that browser.

## Render settings

These match `render.yaml` at the repo root. Field names are the current Blueprint names from the [Blueprint spec](https://render.com/docs/blueprint-spec) (fetched 2026-10-15). `autoDeploy: true` is the deprecated equivalent of `autoDeployTrigger: commit` and is not used.

| Setting | Value |
|---|---|
| Type | `web` |
| Runtime | `static` (a static site, not a web service) |
| Name | `supa-agent-tracker` |
| Branch | `main` |
| Build command | `npm ci && npm run build` |
| Publish directory | `./dist` (`staticPublishPath`) |
| Auto-deploy | `commit` (every push to `main`) |
| Pull request previews | `off` |
| Preview environments | `off` (root `previews.generation`) |
| Rewrite | `/*` → `/index.html` (`type: rewrite`) |
| Environment variables | none |
| Plan | none. Static sites have no compute plan ([static sites](https://render.com/docs/static-sites)) |

The rewrite is what makes a direct load or reload of `/projects/prj_offers` return the app instead of a CDN 404. Render does not apply the rule when a real file exists at that path, so hashed assets under `/assets/` are still served as files ([redirects and rewrites](https://render.com/docs/redirects-rewrites)).

`vite preview` also returns `index.html` for unknown paths. A local 200 on a nested route does **not** prove the Render rewrite is present. That check waits for a real deploy.

## Node.js version

[Setting your Node.js version](https://render.com/docs/node-version) selects the build's Node version in this order:

1. `NODE_VERSION` environment variable
2. `.node-version` at the repo root
3. `.nvmrc`
4. `engines.node` in `package.json`

This service sets no environment variables, so step 1 does not apply. The repo's `.node-version` file contains `24`, which is the pin. `package.json` has `"node": ">=24"`. The same document says an unbounded range resolves to the latest Node release if it is the only pin. `.node-version` is ahead of `engines` in the precedence list, so the unbounded range does not choose the major version.

That document describes the version used to build a service. It does not list static sites as an exception. A static site still runs the build command, which is where Node is required. The selected version is not visible until a Render build log shows it.

## Create the service from the Blueprint

From [Render Blueprints](https://render.com/docs/infrastructure-as-code), after `render.yaml` is on `main`:

1. In the Render Dashboard, choose **New → Blueprint**.
2. Connect the GitHub repo `StephenForte/supa-agent-tracker` and select branch `main`.
3. Leave the Blueprint path as `render.yaml` at the repo root.
4. Confirm the plan lists one static site, `supa-agent-tracker`, and no databases, env vars, or secrets. The form should not ask for secret values.
5. Apply the Blueprint. Render builds with `npm ci && npm run build` and publishes `dist/`.

Do not add a paid instance, a Postgres database, or environment variables for this phase.

## Redeploys

`autoDeployTrigger: commit` starts a new build on every push to `main`. The Blueprint itself also syncs when `render.yaml` changes on the linked branch ([infrastructure as code](https://render.com/docs/infrastructure-as-code)). A successful build replaces the CDN contents and invalidates the cache ([static sites](https://render.com/docs/static-sites)).

A manual deploy from the service's Deploys page uses the current settings and the current `main` commit.

## Verify a deploy

Open the service URL. The banner reads **Demo — simulated data**. Then request every path below. Each HTTP response should be **200** with the app's `index.html` (the server does not 302 `/` to `/projects`; the app does that after load). Then load each URL in a browser and confirm the screen, with no console errors.

| Path | Screen |
|---|---|
| `/` | Projects, after the client redirect |
| `/projects` | Projects, three active cards (Offers, the long dashboard name, Daily weather briefing) |
| `/projects/new` | New project |
| `/projects/prj_offers` | Offers workspace |
| `/projects/prj_offers/edit` | Edit project |
| `/projects/prj_offers?run=run_3` | Offers workspace, run_3 expanded |
| `/agents` | All agents |
| `/agents?view=review` | All agents, Waiting for review pressed, run_3 visible |
| `/settings` | Account settings |
| `/settings/tokens` | MCP tokens |
| `/settings/integrations` | Integration setup, status **Not connected · Not tested** |
| `/login` | Log in |
| `/register` | Register |
| `/verify-email` | Verify email |
| `/forgot-password` | Forgot password |
| `/reset-password` | Reset password |
| `/logout` | Log out |
| `/unknown/path` | Page not found |

Until that list is checked on the Render URL, the `/*` rewrite is unverified. Local `npm run preview` will pass the same list even if `render.yaml` had no rewrite.

## Roll back

On the service's Deploys page, choose **Rollback** on an earlier successful deploy ([rollbacks](https://render.com/docs/rollbacks)). Render republishes that deploy's build artifact. A dashboard rollback turns auto-deploy off so the next push to `main` does not immediately undo it. Turn auto-deploy back on from the service Settings page after the fix is on `main`.

A rollback does **not** restore an older set of static-site redirects, rewrites, or headers. Those stay on the service's current configuration. Rolling back the files does not remove the `/*` → `/index.html` rewrite.

## Sources

Checked 2026-10-15:

- [Static sites](https://render.com/docs/static-sites)
- [Blueprint YAML reference](https://render.com/docs/blueprint-spec), including `runtime: static`, `staticPublishPath`, `autoDeployTrigger`, `branch`, `routes`, and `previews.generation`
- [Blueprint JSON Schema](https://render.com/schema/render.yaml.json) (`previews.generation` enum `automatic` | `manual` | `off`; route `type` enum `redirect` | `rewrite`)
- [Static site redirects and rewrites](https://render.com/docs/redirects-rewrites)
- [Setting your Node.js version](https://render.com/docs/node-version)
- [Render Blueprints (infrastructure as code)](https://render.com/docs/infrastructure-as-code)
- [Service previews](https://render.com/docs/service-previews)
- [Rollbacks](https://render.com/docs/rollbacks)
