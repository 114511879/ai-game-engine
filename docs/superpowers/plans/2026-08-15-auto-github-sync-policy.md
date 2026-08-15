# Automatic GitHub Sync Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-level Codex policy that automatically publishes verified task changes through isolated feature branches and Pull Requests without including pre-existing user changes or merging into `master`.

**Architecture:** A single root `AGENTS.md` acts as the persistent repository instruction boundary. The policy records the initial worktree baseline, creates or reuses an isolated task branch, applies verification and sensitive-file gates, stages only explicit task paths, then pushes and creates or updates a Pull Request. No hook, watcher, helper script, or background process is introduced.

**Tech Stack:** Markdown repository instructions, Git, GitHub Pull Requests, PowerShell verification commands

---

### Task 1: Add the repository-level synchronization policy

**Files:**
- Create: `AGENTS.md`
- Reference: `docs/superpowers/specs/2026-08-15-auto-github-sync-design.md`

- [ ] **Step 1: Verify the policy is not already installed**

Run:

```powershell
if (Test-Path -LiteralPath AGENTS.md) {
    Write-Error 'AGENTS.md already exists; reconcile it before implementation.'
} else {
    Write-Output 'AGENTS.md is absent as expected.'
}
```

Expected: `AGENTS.md is absent as expected.`

- [ ] **Step 2: Create the minimal policy file**

Create `AGENTS.md` with exactly this content:

```markdown
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
```

- [ ] **Step 3: Run policy contract checks**

Run:

```powershell
$policy = Get-Content -LiteralPath AGENTS.md -Raw
$required = @(
    'Treat every pre-existing worktree change as user-owned',
    'fetch `origin/master`',
    'If any required verification fails, stop before commit, push, or Pull Request creation',
    'Stage only explicit paths changed by the current task',
    'Never use broad staging commands',
    'Create a Pull Request targeting `master`',
    'Do not merge or close Pull Requests',
    'Do not read, store, or enter passwords, tokens, or verification codes'
)
$missing = $required | Where-Object { -not $policy.Contains($_) }
if ($missing) {
    $missing | ForEach-Object { Write-Error "Missing policy clause: $_" }
    exit 1
}
if ((Select-String -InputObject $policy -Pattern 'background watcher|post-commit hook').Matches.Count -gt 0) {
    Write-Error 'The policy unexpectedly installs background automation.'
    exit 1
}
Write-Output 'Policy contract checks passed.'
```

Expected: `Policy contract checks passed.`

- [ ] **Step 4: Validate the exact change**

Run:

```powershell
git diff --check
git status --short
git diff -- AGENTS.md
```

Expected: `git diff --check` exits 0; `git status --short` lists only `?? AGENTS.md`; the diff contains only the approved repository policy. The design and plan are already committed and therefore do not appear in worktree status.

- [ ] **Step 5: Commit the policy**

Run:

```powershell
git add -- AGENTS.md
git diff --cached --check
git diff --cached --name-only
git commit -m "chore: add automatic GitHub sync policy"
```

Expected: the staged file list contains only `AGENTS.md`, and the commit succeeds.

### Task 2: Verify and publish the policy Pull Request

**Files:**
- Verify: `AGENTS.md`
- Verify: `docs/superpowers/specs/2026-08-15-auto-github-sync-design.md`
- Verify: `docs/superpowers/plans/2026-08-15-auto-github-sync-policy.md`

- [ ] **Step 1: Run final repository verification**

Run:

```powershell
git diff --check HEAD^ HEAD
git status --porcelain=v1 --branch
git log --oneline origin/master..HEAD
```

Expected: no whitespace errors; the worktree is clean; the branch contains the design, plan, and policy commits only.

- [ ] **Step 2: Push the feature branch**

Run:

```powershell
git push -u origin codex/auto-github-sync-policy
```

Expected: the branch is created or updated on `origin`, and upstream tracking is configured.

- [ ] **Step 3: Create the Pull Request**

Create a Pull Request from `codex/auto-github-sync-policy` into `master` with:

```markdown
## Summary

- add a repository-level Codex policy for verified feature-branch publishing
- isolate user-owned worktree changes through baseline capture and explicit staging
- stop on failed verification and require Pull Requests without automatic merge

## Test Plan

- [x] policy contract checks passed
- [x] `git diff --check` passed
- [x] staged file scope reviewed before each commit
```

Expected: one open Pull Request targets `master` from `codex/auto-github-sync-policy`.

- [ ] **Step 4: Verify remote and Pull Request state**

Run:

```powershell
git status --porcelain=v1 --branch
git rev-parse HEAD
git rev-parse origin/codex/auto-github-sync-policy
```

Verify on GitHub that the Pull Request head branch is `codex/auto-github-sync-policy` and its head commit matches the local HEAD.

Expected: the worktree is clean; both Git commit IDs are identical; the Pull Request remains open and unmerged.
