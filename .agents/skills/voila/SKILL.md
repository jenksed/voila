```markdown
# voila Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you how to contribute effectively to the `voila` TypeScript codebase. It covers coding conventions, commit patterns, and the main workflows for updating project status, recording verification receipts, implementing features or bugfixes with tests, and documenting features or verifications. You'll learn how to structure code, write tests, and use suggested commands to streamline common development tasks.

## Coding Conventions

- **Language:** TypeScript
- **Framework:** None detected
- **File Naming:** Use `camelCase` for file names.
  - Example: `myFeature.ts`, `userProfile.test.ts`
- **Import Style:** Use relative imports.
  - Example:
    ```typescript
    import { myFunction } from './utils/myFunction';
    ```
- **Export Style:** Use named exports.
  - Example:
    ```typescript
    // In src/utils/myFunction.ts
    export function myFunction() { ... }
    ```
    ```typescript
    // In another file
    import { myFunction } from './utils/myFunction';
    ```
- **Commit Patterns:** Conventional commits with prefixes such as `chore`, `fix`, `docs`, `test`, `style`, `feat`.
  - Example: `feat: add user authentication to login flow`

## Workflows

### Update Project State and Status
**Trigger:** When a work item is completed, next action changes, or project status needs to be updated.  
**Command:** `/update-project-status`

1. Edit `.voila/project.json` to update the project state or next action.
2. Append a new event to `.voila/events.jsonl` to record the change.
3. Update `.voila/views/PROJECT_STATUS.md` with the new project status.
4. Optionally, update `.voila/briefs/PROJECT_BRIEF.md` if the project brief has changed.

**Example:**
```jsonc
// .voila/project.json
{
  "state": "in-progress",
  "nextAction": "Review PR #42"
}
```

---

### Add or Update Verification Receipts
**Trigger:** When a verification or acceptance test is run and its results need to be recorded.  
**Command:** `/record-verification`

1. Create or update `.voila/receipts/RCP-XX/manifest.json` with metadata about the verification run.
2. Add or update `.voila/receipts/RCP-XX/stdout.txt` and `stderr.txt` with the output logs.
3. Update `.voila/events.jsonl` and `.voila/project.json` to reflect the verification event.
4. Update `.voila/views/PROJECT_STATUS.md` to show the verification status.

**Example:**
```json
// .voila/receipts/RCP-05/manifest.json
{
  "test": "user login flow",
  "status": "passed",
  "timestamp": "2024-06-20T12:34:56Z"
}
```

---

### Feature or Bugfix with Tests
**Trigger:** When developing a new feature or fixing a bug that requires code and test changes.  
**Command:** `/feature-with-tests`

1. Modify or add implementation files in `src/`.
2. Update or add corresponding test files in `test/`.
3. Optionally, update related documentation or UI files.

**Example:**
```typescript
// src/user/login.ts
export function login(username: string, password: string): boolean {
  // implementation
}

// test/user/login.test.ts
import { login } from '../../src/user/login';

test('login succeeds with correct credentials', () => {
  expect(login('user', 'pass')).toBe(true);
});
```

---

### Document Feature or Verification
**Trigger:** When a feature is completed or verified and needs to be documented for maintainers or users.  
**Command:** `/document-feature`

1. Add or update design docs in `docs/design/` or verification docs in `docs/verification/`.
2. Update `README.md` and other project-level docs.
3. Update doctrine or handoff documentation as needed.

**Example:**
```markdown
// docs/design/user-authentication.md
# User Authentication Design

This document describes the authentication flow and security considerations...
```

## Testing Patterns

- **Test Framework:** Not explicitly detected; standard TypeScript test patterns.
- **Test File Pattern:** Files end with `.test.ts` and are located in `test/` directories.
- **Example:**
  ```typescript
  // test/utils/parseInput.test.ts
  import { parseInput } from '../../src/utils/parseInput';

  test('parses valid input', () => {
    expect(parseInput('42')).toBe(42);
  });
  ```

## Commands

| Command                | Purpose                                                        |
|------------------------|----------------------------------------------------------------|
| /update-project-status | Update project state, events, and status views                 |
| /record-verification   | Record verification runs and outputs as receipts               |
| /feature-with-tests    | Implement a feature or bugfix with corresponding tests         |
| /document-feature      | Document new features, verifications, or project documentation |
```
