<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Rules for every pull request

Claude builds and maintains this app and merges its own PRs. Every PR must pass all three gates first:

1. **100% test coverage.** `npm test -- --coverage` fails below 100% lines, branches, functions or statements.
2. **JSDoc documentation.** Every exported function, component, class, type and constant has a `/** ... */`
   comment saying what it does (with `@param`, `@returns`, `@throws` where they help). `npm run lint` fails on
   a missing one (`jsdoc/require-jsdoc` in `eslint.config.mjs`).
3. **Code review.** Review the diff, fix real findings, and note anything deliberately left in the PR body.

CI runs lint, typecheck, tests with coverage, the build and the database schema tests. Merge only when it is green.
