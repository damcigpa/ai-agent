# Proposal

## Why

`/import` was built before it had a specification; its behavior was later written down in `packages/agent/specs/import/import.md`. Moving it into OpenSpec makes it the single source of truth for this capability, next to the material library. No behavior changes.

## What Changes

- Adds the specification of the existing `/import` command: a student puts photos or text files of their study material into `materials/`, runs `/import`, then `/quiz` tests them on that material.
- Records the known differences between the code and the agreed behavior, and the open questions, in the design.

## Capabilities

### New Capabilities
- `material-import`: one-shot import of study material from `materials/` into the findings that `/quiz` uses.

### Modified Capabilities

## Impact

- No code changes. Describes `src/agent.ts` (`/import`), `src/tools/readMaterial.ts` and `src/spokes/materialSpoke.ts`.
- Replaces `packages/agent/specs/import/import.md` and `import.plan.md`.
