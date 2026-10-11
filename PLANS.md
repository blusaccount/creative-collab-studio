# ExecPlan template

For a task that is large, risky or spans several modules. Copy this to `docs/plans/<name>.md`, keep it short and update it while you work.

Every statement about the code names the file it was read in. What was not read goes under "Not read", not into a sentence that sounds like a fact.

## Purpose

The outcome a user sees.

Verify (end state): the steps that prove it works, as someone would do them by hand.

## Scope

In:
- ...

Out (decided):
- ... and why, so it is not reopened by accident.

## Context

Read on <date>, branch `<name>`.

What exists:
- <fact> (`path/to/file.ts`, function or line)

What stands against it:
- <constraint or conflict> (`path/to/file.ts`)

Not read:
- <what was not checked, and what depends on it>

## Plan of Work

Stages with numbered steps. Each stage ends in something that can be verified on its own.

### Stage 1: <name>
1. ...

## Progress

- [ ] Plan written
- [ ] Stage 1

## Surprises and Discoveries

What turned out different from the Context section.

## Decision Log

- <date>, <who decided>: <decision>. Rationale: ...

Readings (the plan's interpretation of an answer, not confirmed by the maintainer):
- ...

Placeholders (numbers nobody decided; kept as named constants in one module):
- ...

## Open Questions

- <question>. Until decided: <what the plan assumes>.

## Verification

Exact commands and manual steps.

## Outcomes

What shipped and what remains.
