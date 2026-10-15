# Phase 0 UX review

The operator runs this after a break, on the demo shell (local or, later, the Render URL). **Nothing below is an approval.** Items in Findings are operator decisions. They were not changed in the integration pass.

Start from a clean seed: **Reset demo**, then confirm. The notes below describe that seed. Edits left in this browser will not match them.

## Review script

### 1. Return to the three projects

Route: `/projects`.

Look at the three cards, in this order: **Offers workspace**, the long **Supa dashboard** name, **Daily weather briefing**. The status line says 3 of 4 projects shown. Lifecycle says Archived hidden.

Good: Offers shows live running 3, stale running 0, review needed 1. The dashboard card shows live running 0 and stale running 1. Weather shows live running 0, stale running 0, and no repository or PRD link (both read as an em dash). The archived prototype is not a card. Each card shows a first open step or "No open steps", and a private-note line.

### 2. Identify finished work and work that is still running

Routes: `/projects/prj_offers`, then `/projects/prj_dashboard`, then `/projects/prj_weather`.

Look at the header counts and the agent-run rows. Compare each count with the card you just left. Execution state and work status are separate columns. Liveness is its own column.

Good:

- Offers header matches the card: live running 3, stale running 0, review needed 1, live logical agents 2, logical agents 2, runs 4. Rows `run_1`, `run_10`, and `run_2` say **Running** and **In progress**. `run_1` and `run_2` also say **Concurrent**. `run_3` says **Finished** and **Waiting for review**, its elapsed time does not tick, and it links pull request **#74**.
- Dashboard header matches its card: stale running 1. `run_4` says **Running**, **Blocked**, and **Stale**, and its model is **Unknown**. `run_5` says **Failed** and **Failed**, and its harness is **Unknown**.
- Weather has no live or stale runs. `run_7`, `run_8`, and `run_9` say **Finished** and **Completed**. Task and PR cells are an em dash. There is no "Demo: close" control on those finished rows.

### 3. See the first human step

Route: `/projects/prj_offers` (the same text is on the Offers card).

Look at **Agent next steps**, under Open.

Good: the first open instruction is "Review and merge PR #74 after checking the form." The card says Remaining: 1 and names source agent T0-11b. The waiting note says T0-11a is still implementing the second form variant. The completed step about the narrow-screen preview stays completed and names Demo operator.

### 4. Open the review-needed pull request

Route: `/projects/prj_offers?run=run_3`, or expand `run_3` from the grid.

Look at the PR cell and the expanded Pull requests list.

Good: the row links **#74 Add accessible offer inputs** to `https://github.com/example-org/offers/pull/74` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). **+1 more** reveals **#77** in the same run. The app does not request GitHub itself. The address bar of this demo does not change when the PR link opens.

### 5. Check a step

Route: `/projects/prj_offers`.

Check "Review and merge PR #74 after checking the form." Then go back to `/projects`.

Good: the checkbox moves that instruction to Completed, with a completion time. The Offers card no longer shows it as the open step (weather and the dashboard keep their own steps). The control does not run a command, merge anything, or leave the site. Uncheck it if you want the seed wording back; **Reset demo** also restores it.

### 6. Write a private reminder

Route: `/projects/prj_offers`, **My private notes**.

Add a sentence such as "Remind me to look at PR #74 tomorrow." Press **Save**. Return to `/projects` and read the Offers card. Open `/settings/integrations`, choose Offers workspace, and read the reporting preview.

Good: the panel says Saved, and the card preview shows the new sentence. The integration preview's open steps and waiting note do not contain the private sentence. The note is described as browser-only. **Reset demo** removes it and brings back the seed note.

### 7. Filter All agents

Route: `/agents`.

Press **Waiting for review**. Then **Live**. Then **Completed**. Use **Show all** or **Active** to come back.

Good: Waiting for review shows `run_3` and not the running rows. Live shows `run_1`, `run_2`, and `run_10` only. Stale `run_4` stays on Active and is absent from Live. Completed shows the weather runs (`run_7`, `run_8`, `run_9`). Each row's execution, work status, and liveness match the project page. Project names link to that project. A nonsense `?view=` value stays on Active.

## Findings

Each item is an **operator decision**. The integration pass did not change these.

| Severity | Screen | Proposed change |
|---|---|---|
| minor | Projects (`/projects`) and All agents (`/agents`) | The project activity filter says **Stale running**. The run-grid activity filter says **Stale**. Use one phrase if they should read as the same filter. **Operator decision.** |
| minor | Project cards and project detail | The count is labelled **Review needed**. The work-status badge and the All agents preset say **Waiting for review**. Rename the count if one phrase should cover both. **Operator decision.** |
| minor | Projects (`/projects`) | The line "3 of 4 projects shown" counts the archived prototype that the default filter hides. Say that the fourth project is archived, or count only projects in the current lifecycle set. **Operator decision.** |
| minor | Project cards | **Remaining: 1** includes the step already printed above it. Say "1 open" if "remaining" sounds like further steps. **Operator decision.** |
| minor | Run detail timeline | Event kinds are shown as `check_in`, `check_out`, `status`, `heartbeat`, and `manual_close`, next to the human execution and work labels. Spell them out if the audit row should read like the rest of the status vocabulary. **Operator decision.** |
| minor | Run detail, tools and timeline | Tool source is the raw value (`shell`, `native`, `mcp`) and the actor is an id (`agt_…`, `usr_demo`). Replace them with names if the row is for reading rather than for checking the record. **Operator decision.** |
| minor | Elapsed column, every grid | Durations always include hours, so a short run reads `0h 21m 59s`. Drop leading zero units if that is noisy. **Operator decision.** |
| minor | Demo banner, narrow width | Below 700px the banner keeps **Demo — simulated data** and hides "Local browser state only". Keep that phrase on a narrow screen if it should stay visible. **Operator decision.** |
| minor | Project detail | `updateRunMetadata` can correct a run's title, task, harness, model, or PR text, and there is no control for it. Phase 0's screen list does not require one. Add a clearly labelled demo editor only if the review needs to correct metadata before Phase 1. **Operator decision.** |
