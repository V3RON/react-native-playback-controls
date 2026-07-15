# Worker Protocol (LOOP)

You are an autonomous implementation worker for `react-native-playback-controls`,
a **New-Architecture-only** React Native Turbo Module that drives the system
media controls (iOS: MPNowPlayingInfoCenter + MPRemoteCommandCenter, Android:
media3 MediaSessionService) without playing any audio itself.

You have been assigned exactly **one** task file from `docs/tasks/`. Follow this
protocol from top to bottom.

## 1. Gather context

1. Read your assigned task file in `docs/tasks/` completely before writing code.
2. Read `docs/IDEAS.md` (deferred features — do NOT implement them, but don't
   design them out either).
3. Run `git log --oneline -20` and read the handoff notes passed to you in your
   prompt; previous tasks' commits are your foundation.
4. Skim the existing code your task touches before editing it.

## 2. Ground rules

- **You cannot ask questions.** Make the most reasonable decision and record it
  in your handoff report under "Decisions & deviations".
- The **public JS API contract in the task file is fixed.** Do not rename,
  reshape, or extend it. If a *platform* API differs from what the task file
  claims (they evolve), verify against official docs (web search is available),
  adapt the *implementation*, keep the JS contract intact, and document it.
- Stay in scope: only the work in your task file. Never edit other task files,
  `docs/LOOP.md`, or `docs/IDEAS.md`.
- Code style: match the existing scaffold (Prettier config in package.json,
  ESLint). Comments only for non-obvious constraints.
- Every exported TypeScript symbol gets JSDoc (semantics, defaults, units,
  `@platform` notes, `@throws`) — the exported types are the documentation.
- Never `git push`, never publish, never touch the release config.

## 3. Implement

Work in small verifiable steps. Repo commands (run from the repo root, Yarn 4
workspaces):

| Purpose | Command |
|---|---|
| Install deps | `yarn` |
| Typecheck | `yarn typecheck` |
| Lint | `yarn lint` |
| Unit tests | `yarn test` |
| Example app scripts | `yarn example <script>` (see `example/package.json`) |
| Regenerate example native projects | `cd example && npx expo prebuild --platform <ios\|android> --clean` |

The example app is an **Expo prebuild app**: `example/ios` and `example/android`
are generated, not committed. Native library code lives in `ios/` and `android/`
at the repo root; codegen artifacts are generated during the example app build
from `src/NativePlaybackControls.ts` (codegenConfig name: `PlaybackControlsSpec`).

## 4. Verify

Always green before review: `yarn typecheck && yarn lint && yarn test`.
Then run the **task-specific verification** listed under "Acceptance criteria"
in your task file (native builds, etc.). If a verification step is impossible in
your environment (e.g. missing SDK), do not fake it — record exactly what you
could not run in the handoff report.

## 5. Self-review loop

1. Run `git diff` (plus `git status` for new files) and re-read the entire diff
   as a hostile reviewer.
2. Check against, in order:
   - every acceptance criterion in the task file;
   - correctness: threading (MP* and media3 APIs are main-thread), lifecycle
     (dev reload via `invalidate`, double-start, end-after-end), error paths
     (every rejection has a stable kebab-case code), memory (listeners,
     coroutine scopes, retained blocks);
   - API quality: no accidental public exports, JSDoc on everything exported,
     no platform names leaking into shared types.
3. Fix every issue you find, re-run the verification suite, and repeat until a
   full pass yields **zero** new issues.

## 6. Commit & handoff

1. Stage all task changes and commit on the current branch (do not create
   branches, do not push). Conventional Commits are enforced by commitlint,
   e.g. `feat: add public JS API and Turbo Module spec`. Lefthook runs lint on
   commit — the commit failing is a signal to fix, not bypass (`--no-verify`
   is forbidden).
2. End with a handoff report containing exactly these sections:
   - **Summary** — what was built, in 2–4 sentences.
   - **Files** — created/modified list.
   - **Verification** — each command run and its result.
   - **Decisions & deviations** — anything you chose or changed vs. the task
     file, with reasons.
   - **Notes for next tasks** — gotchas the following workers must know.
