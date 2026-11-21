# Instructions for AI contributors

Before doing any work in this repository, read `RADAR_AI_MASTER_CONTEXT.md` completely.

Treat it as the project handoff and operating guide. Then inspect the latest `main` commit and the actual files relevant to the task. The master document can be stale; verify before acting.

Do not restart analysis from zero, ask the owner to repeat information already documented, remove existing features, or overwrite whole files for small changes. Preserve all existing dashboard menus and behavior.

Run relevant tests, inspect the diff for accidental deletions and secrets, and update `RADAR_AI_MASTER_CONTEXT.md` after each meaningful change with the new commit, test results, deployment status, open bugs, and next task.

Never claim a Hostless deployment is live without checking Hostless. Never put API secrets in source code, frontend code, logs, chat, or documentation. Never enable withdrawals or live trading without explicit owner approval and required safeguards.
