# Repository Instructions

## Automatic GitHub Sync For Codex Changes

Apply this workflow only when Codex changes files in this repository. Read-only answers, diagnosis, reviews, and tasks with no file changes do not trigger Git synchronization. Changes made outside the current Codex task are user-owned and must not be automatically committed.

### Before Editing

1. Record the current branch, HEAD, staged changes, unstaged changes, and untracked files.
2. Treat every pre-existing worktree change as user-owned. Do not overwrite, restore, stage, or commit it.
3. For a new task, fetch `origin/master` and create a branch named `codex/<short-task-name>` from `origin/master` without changing local `master`. Use lowercase letters, digits, and hyphens; add a date or sequence number when needed.
4. If fetching `origin/master` fails, ask whether to continue from the existing reference. Do not assume it is current.
5. If the user explicitly asks to continue an existing Pull Request, reuse that Pull Request's branch instead of creating another branch.

### Completion Gate

1. Run fresh verification proportional to the change. Check documentation/configuration diffs and format; run affected JavaScript or Python tests; run relevant Gradle checks, tests, and builds for Android changes; broaden verification for shared or high-risk behavior.
2. If any required verification fails, stop before commit, push, or Pull Request creation and report the failing command and key error.
3. Inspect task files for API keys, tokens, passwords, private/signing keys, local environment files, caches, temporary test files, accidental screenshots, unrequested build outputs, and unexplained large binaries. Do not publish them. Large required assets need confirmed provenance, license, size, and remote compatibility.
4. Stage only explicit paths changed by the current task. Never use broad staging commands such as `git add .`, `git add -A`, or equivalents.
5. Review the staged file list and staged diff before committing. If current-task edits cannot be separated safely from pre-existing user edits in the same file, stop and ask the user.

### Publish Through A Pull Request

1. Commit only the reviewed staged changes with a concise Conventional Commits message such as `feat: ...`, `fix: ...`, or `docs: ...`.
2. Push the task branch to `origin` and set its upstream.
3. Create a Pull Request targeting `master`, or update the existing Pull Request when continuing its branch. Do not create duplicates.
4. Include in the Pull Request the change summary, exact verification commands and results, and known limitations. Never claim an unrun check passed.
5. Verify local HEAD, the remote-tracking branch, and the Pull Request head commit agree.
6. In the final response provide the Pull Request URL, branch, commit ID, verification results, and state explicitly that it has not been merged.

### Never Automate

- Do not commit directly to, merge into, or automatically update local `master`.
- Do not merge or close Pull Requests.
- Do not force-push, rewrite history, delete branches, or remove host-managed worktrees.
- Do not read, store, or enter passwords, tokens, or verification codes. If GitHub authentication is required, pause for the user to sign in, then continue.
- Do not stage or commit changes that were present before the current task.

### Failure State

On push failure, retain the local commit and branch and report the remote error. On Pull Request creation failure, retain the pushed branch and provide the comparison URL or exact blocker. Always state whether changes remain only in the worktree, in a local commit, or on a remote branch.
