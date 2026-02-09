# Conductor Instructions - Phase Orchestration

**Role:** Project conductor managing phase execution and dependencies

**Responsibility:** Coordinate sequential and parallel phase execution, manage PR reviews, and ensure quality gates before merging

---

## Core Workflow

### Phase Execution Cycle

```
Phase Agent Spawned
    ↓
Implementation (TDD: tests → code → verify)
    ↓
PR Created (automatically by agent)
    ↓
Code Review Comments Retrieved & Reported
    ↓
Conductor Reviews PR
    ↓
Approve / Request Changes
    ↓
Merge to Main (if approved)
    ↓
Dependent Phases Unblocked
```

---

## Agent Reporting

When a phase completes, the implementation agent will report:

```
## Phase N: [Name] - COMPLETE

### Status: ✅ Ready for Review

### PR Link
https://github.com/nexaddo/openclaw-discord-voice/pull/[NUMBER]

### Tests
[X/Y passing]

### Git Commits
- hash1: message
- hash2: message

### Code Review Comments
[Any GitHub comments, or "None yet"]

### Summary
[What was built]

### Next Steps
[What conductor should do]
```

---

## Your Decisions as Conductor

### When PR is Ready for Review

1. **Open PR link** from agent report
2. **Review code** and test results
3. **Check GitHub for review comments** (in case code was reviewed before reporting)
4. **Decision:**
   - ✅ **Approve** → Proceed to merge
   - 🔄 **Request Changes** → Tell agent what to fix
   - ❓ **Need More Info** → Ask agent for clarification

### When Approving

```
You: "Approved! Merge PR #2"

Conductor (me):
1. Merge PR to main via GitHub CLI
2. Check for dependent phases waiting
3. Spawn next phase agents
```

### When Requesting Changes

```
You: "Phase 4 PR: Please add error handling for timeout scenario (see GitHub comment)"

Conductor (me):
1. Tell agent what to fix
2. Agent fixes code, updates PR
3. Repeat review cycle
```

### Important: Don't Merge Until You Approve

⚠️ **CRITICAL:** I will NOT merge any PR to main until you explicitly approve it.

Rule: **All review comments must be addressed + explicit user approval required before merge**

---

## Parallel vs Sequential Phases

### Parallel Execution

Phases that can run simultaneously (no dependencies):

```
Phase 4 (STT)     ]
                  ] → Both running, Phase 6 waits for both
Phase 5 (TTS)     ]
```

**Conductor action:** Spawn both agents at same time

### Sequential Execution

Phases that depend on previous phases:

```
Phase 4 ✅ MERGED
Phase 5 ✅ MERGED
         ↓
Phase 6 (Command Pipeline) ← waits here
         ↓
Phase 7 (Discord Plugin) ← waits here
```

**Conductor action:** Only spawn Phase 6 after Phase 4 & 5 are merged to main

---

## Current Status (2026-02-06 22:49 EST)

| Phase             | Status           | PR  | Action                     |
| ----------------- | ---------------- | --- | -------------------------- |
| Phase 4 (STT)     | Ready for Review | #2  | Waiting for your approval  |
| Phase 5 (TTS)     | Ready for Review | #3  | Waiting for your approval  |
| Phase 6 (Command) | Blocked          | -   | Waiting for 4 & 5 to merge |
| Phase 7 (Plugin)  | Design Complete  | #4  | Waiting for 6 to merge     |

---

## Your Next Action

**Choose one:**

### Option A: Approve & Merge All

```
"Approved! Merge Phase 4 & 5 to main"

Conductor will:
1. Merge PR #2 (Phase 4) to main
2. Merge PR #3 (Phase 5) to main
3. Spawn Phase 6 agent (Command Pipeline)
4. Phase 6 will unblock and start
```

### Option B: Request Changes

```
"Phase 4 PR: Please add error handling for timeout scenario"

Conductor will:
1. Tell Phase 4 agent what to fix
2. Agent implements fix and updates PR
3. Review again
4. Repeat until approved
```

### Option C: Review Comments First

```
"Show me Phase 4 PR code review comments first"

Conductor will:
1. Fetch PR #2 comments from GitHub
2. Display for you to review
3. You decide: approve, request changes, or ask questions
```

---

## PR Review Checklist

Before approving any PR, verify:

- ✅ **Tests Passing:** X/Y tests all green
- ✅ **Code Quality:** Follows TypeScript/Node.js standards
- ✅ **Integration:** Compatible with previous phases
- ✅ **Documentation:** Clear implementation summary
- ✅ **Error Handling:** Graceful failure, retry logic
- ✅ **Types:** Full TypeScript strict mode
- ✅ **No Blockers:** No GitHub issues marked `critical-blocker`

---

## Merge Protocol

When you approve a PR:

1. **Tell conductor:** "Approved! Merge Phase X PR"
2. **Conductor will:**
   - Merge to main via `gh pr merge`
   - Confirm merge on GitHub
   - Spawn dependent phase agents (if any)
   - Report which phases are now unblocked

---

## Phase Dependencies (Reference)

```
Phase 1 (Foundation)     ✅ MERGED
Phase 2 (VoiceManager)   ✅ MERGED
Phase 3 (AudioHandler)   ✅ MERGED
         ↓
Phase 4 (STT)  ]
               ] → Both parallel
Phase 5 (TTS)  ]
         ↓↓
Phase 6 (Command Pipeline) ← Must wait for both 4 & 5
         ↓
Phase 7 (Discord Plugin) ← Must wait for 6
         ↓
Phase 8 (CI/CD & Deploy) ← Must wait for 7
```

---

## Communication Protocol

**Phase agents report to conductor (me).**  
**You tell conductor what to do.**  
**Conductor executes decisions.**

### Agent Reports

```
"Phase 4 complete: PR #2 ready for review"
```

### Your Decision

```
"Approved, merge it"
```

### Conductor Action

```
"Merging #2 to main... ✅ Spawning Phase 6"
```

---

## Emergency Scenarios

### What if a PR has conflicts?

- Agent will report: "PR #2 has merge conflicts"
- You decide: Fix conflicts or rebase
- Conductor executes the fix

### What if tests fail in PR?

- Agent will report: "Tests failed: X/Y passing"
- Agent will iterate to fix
- New commit will be added to PR
- You review the fix

### What if code review blocks merge?

- GitHub will show review comments
- You see the feedback
- Agent fixes and updates PR
- Review cycle repeats

---

## Summary

**You control the flow:**

1. Agents report: "PR #X ready"
2. You say: "Approved" or "Fix this"
3. I execute: Merge or tell agent to fix
4. Loop continues until all phases done

**No PR merges without your explicit approval.**

---

**Ready to proceed? Tell me what you want to do with Phase 4 & 5 PRs.**
