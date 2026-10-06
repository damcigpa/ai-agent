# Proposal

## Why

The `/import` code has known differences from its specification (`material-import`, deviations D-2 to D-5) and only one of its four verification layers exists. This change adds the missing tests and brings the code in line with the spec. It does not change required behavior; where a fix needs a behavior decision first (D-2, D-4), that decision comes before the code, and if it changes a requirement, a spec delta is added then.

## What Changes

- Tests for the extraction step and for the command flow (verification layers 2 and 3), with D-3 marked as a known failure until it is fixed.
- A manual eval for the model-dependent requirements (layer 4).
- Fixes: cleanup also when the folder holds only unsupported files (D-3); a clearer message in that case (D-4); `.jpeg` named in the messages (D-5); a decision on commands typed while a quiz is waiting (D-2).

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `src/tools/readMaterial.ts`, `src/agent.ts` (`/import` branch), `src/spokes/materialSpoke.ts`.
- New test files `src/spokes/materialSpoke.test.ts`, `src/agent.import.test.ts`; eval script for the extraction.
