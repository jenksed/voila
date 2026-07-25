```markdown
# newfang Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and workflows used in the `newfang` TypeScript codebase. You'll learn the project's coding conventions, how to upgrade schemas and migrate state, how to record and verify proof artifacts, and how to write and run tests. The guide also introduces common commands to streamline your workflow.

## Coding Conventions

- **Language:** TypeScript
- **Framework:** None detected
- **File Naming:** Use `camelCase` for filenames.
  - Example: `projectState.ts`, `migrateChain.test.ts`
- **Import Style:** Use relative imports.
  ```typescript
  import { migrateProject } from './migrate';
  ```
- **Export Style:** Use named exports.
  ```typescript
  // src/domain/schema-v3.ts
  export interface ProjectSchemaV3 { ... }
  export function validateV3Schema(data: unknown): boolean { ... }
  ```
- **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/) with prefixes like `feat`, `fix`, and `docs`.
  - Example: `feat: add migration for schema v4`

## Workflows

### Schema Migration and State Upgrade
**Trigger:** When introducing a new schema version or migrating project state to a new structure  
**Command:** `/migrate-schema`

1. **Update schema definitions and migration logic.**
   - Edit or add files like `src/domain/schema-vX.ts` and update migration logic in `src/domain/migrate.ts`.
   ```typescript
   // src/domain/schema-v4.ts
   export interface ProjectSchemaV4 { ... }
   ```
2. **Update or create migration tests and fixtures.**
   - Add or modify tests such as `test/migrate-vX.test.ts`.
   - Update fixtures like `test/fixtures/integrated-vX-project.json`.
   ```typescript
   // test/migrate-v4.test.ts
   import { migrateProject } from '../../src/domain/migrate';
   import v3Fixture from '../fixtures/integrated-v3-project.json';
   ```
3. **Update canonical state files.**
   - Modify `.newfang/project.json` and `.newfang/events.jsonl` to reflect the new schema.
4. **Ensure all related test suites pass.**
   - Run tests such as `test/migrate-chain.test.ts` and `test/migrate.test.ts` to verify migration correctness.
5. **Document the migration and its rationale.**
   - Update documentation, e.g., `docs/verification/PACKET_X_PROOF_ENGINE.md`, to explain the changes and reasoning.

### Recording and Verifying Proof Artifacts
**Trigger:** When recording new proof artifacts (claims/receipts) for work items and updating project state  
**Command:** `/record-proof`

1. **Generate new claim and/or receipt files.**
   - Create files under `.newfang/receipts/RCP-*/` such as `manifest.json`, `stdout.txt`, and `stderr.txt`.
2. **Update project state and event logs.**
   - Edit `.newfang/project.json` and `.newfang/events.jsonl` to register new claims/receipts and log the event.
3. **Update related documentation and status views.**
   - Update `.newfang/views/PROJECT_STATUS.md` and `docs/verification/PACKET_X_PROOF_ENGINE.md` as needed.
4. **Demonstrate or dogfood the new artifacts.**
   - Run verification commands and ensure state transitions are correct.
5. **Ensure canonical state is updated.**
   - Confirm that all changes are reflected and, where required, are byte-identical to canonical state.

## Testing Patterns

- **Test File Naming:** Use `*.test.ts` for test files.
  - Example: `migrate-v4.test.ts`
- **Test Framework:** Not explicitly detected; use standard TypeScript testing patterns.
- **Typical Structure:**
  ```typescript
  // test/migrate-v4.test.ts
  import { migrateProject } from '../../src/domain/migrate';
  import v3Fixture from '../fixtures/integrated-v3-project.json';

  describe('migrateProject', () => {
    it('migrates v3 to v4 schema correctly', () => {
      const result = migrateProject(v3Fixture);
      expect(result.version).toBe(4);
    });
  });
  ```

## Commands

| Command          | Purpose                                                      |
|------------------|--------------------------------------------------------------|
| /migrate-schema  | Start schema migration and state upgrade workflow            |
| /record-proof    | Record new proof artifacts and update project state          |
```
