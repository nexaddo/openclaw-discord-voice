# Phase Completion Checklist

**Use this checklist when completing any phase implementation.**

Implementation agents MUST follow this before reporting completion.

---

## Pre-PR Checklist

- [ ] All tests written and passing (X/Y tests)
- [ ] Code implemented and formatted
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No linting errors (`npm run lint`)
- [ ] All files committed to branch
- [ ] Branch pushed to origin (visible on GitHub)

**Example:**

```bash
npm run test           # Verify all tests pass
npm run type-check     # Verify TypeScript
npm run lint           # Verify linting
git status             # Verify all committed
git push origin BRANCH # Push to GitHub
```

---

## PR Creation

- [ ] PR created (not just branch)
- [ ] PR base: `main`
- [ ] PR head: `phase-N-BRANCH`
- [ ] PR title includes test count: "Phase N: [Name] - X/Y Tests Passing"
- [ ] PR body includes:
  - Key deliverables
  - Test results
  - Integration notes
  - Files created/modified

**Command:**

```bash
gh pr create \
  --base main \
  --head phase-N-BRANCH \
  --title "Phase N: [Name] - X/Y Tests Passing" \
  --body "..."
```

**Note PR number from output:** `https://github.com/nexaddo/openclaw-discord-voice/pull/[NUMBER]`

---

## Code Review Retrieval

- [ ] Check if PR already has review comments
- [ ] Retrieve PR comments (if any exist)
- [ ] Include comments in final report

**Command:**

```bash
# Check for existing reviews
gh pr view PR_NUMBER

# Retrieve any comments
gh pr review --json comments --jq '.[] | .comments[] | .body' PR_NUMBER
```

---

## Final Report to Conductor

Report must include:

### Header

- [ ] Phase name and number
- [ ] Status: "✅ Ready for Review" or "🚫 Blocked"
- [ ] Delivery date/time

### Implementation Summary

- [ ] Tests: X/Y passing
- [ ] Files created (list)
- [ ] Files modified (list)
- [ ] Key functions implemented

### PR Information

- [ ] PR URL: `https://github.com/nexaddo/openclaw-discord-voice/pull/[NUMBER]`
- [ ] Branch: `phase-N-BRANCH`
- [ ] Base: `main`
- [ ] Commits (hash list with messages)

### Code Review Status

- [ ] Any existing PR review comments
- [ ] Current review status from GitHub

### Integration Notes

- [ ] Compatible with previous phases
- [ ] Ready for next phase (if dependent)
- [ ] All types exported
- [ ] Documentation updated

### Next Steps

- [ ] What conductor should do (review, approve, merge)
- [ ] What happens after merge (which phases unblock)
- [ ] Any blockers or warnings

**Example:**

```markdown
## Phase 4: Speech-to-Text (STT) Pipeline - COMPLETE

### Status: ✅ Ready for Review

### Implementation Summary

- **Tests:** 62/62 passing
- **Created:** SpeechToText.ts, VoiceActivityDetector.ts
- **Modified:** index.ts, types.ts
- **Key Functions:** transcribeAudio(), detectVoiceActivity(), ...

### PR Information

- **PR:** https://github.com/nexaddo/openclaw-discord-voice/pull/2
- **Branch:** phase4-stt-implementation
- **Commits:**
  - `cdec328` - Phase 4: STT Pipeline Implementation
  - `9ca8e6f` - Phase 4: Update exports

### Code Review Status

- No review comments yet (PR just created)

### Integration Notes

- ✅ Fully compatible with Phase 3 (AudioStreamHandler)
- ✅ Ready for Phase 6 integration
- ✅ All types exported in index.ts
- ✅ Documentation complete

### Next Steps

1. Conductor: Review PR code
2. You (user): Approve or request changes
3. Conductor: Merge if approved
4. Phases 4 & 5 merged → Phase 6 unblocks
```

---

## What Happens After Report

1. **You see PR link** from agent report
2. **You review** the PR on GitHub
3. **You tell conductor:** "Approved" or "Please fix X"
4. **Conductor:**
   - If approved: Merges PR to main
   - If changes needed: Tells agent what to fix
   - If blocked: Investigates with you
5. **Dependent phases:** Automatically spawn (if all dependencies met)

---

## Common Mistakes to Avoid

❌ **Don't:**

- Leave PR unmerged while continuing other phases
- Forget to push branch to origin
- Skip code review step
- Report completion without PR link
- Merge to main without explicit user approval

✅ **Do:**

- Create PR immediately after tests pass
- Retrieve code review comments
- Report PR link in completion message
- Wait for user approval before merging
- Let conductor handle merge (don't force merge)

---

## Help

If unsure about any step:

1. Check `voice-implementation-agent.md` for detailed instructions
2. Check `CONDUCTOR_INSTRUCTIONS.md` for workflow context
3. Ask conductor (Rue) for clarification

---

**Remember:** PR creation and review is part of phase completion, not optional!
