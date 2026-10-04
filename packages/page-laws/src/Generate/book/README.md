# Book generation architecture

Book generation remains owned by `@slonigiraf/app-laws`; these folders are internal boundaries, not separate packages.

## Dependency direction

Production code should flow in one direction:

`pages/features -> application -> domain`

Infrastructure adapters are called by application/UI code and may depend on domain types and pure helpers. Domain code must not import React, browser storage, OpenRouter clients, PDF libraries, page/feature modules, or other infrastructure adapters.

## Folders

- `domain/` — deterministic book rules and transformations. This includes chapters, concepts, exercises, metadata, standards calculations, publishing JSON construction, and pure content helpers. Prefer functions that are easy to unit test and have no browser/network side effects.
- `application/` — use cases and orchestration. This includes processing commands, pipeline flow, AI request orchestration, pricing, publishing coordination, and workspace services used by React hooks.
- `infrastructure/` — external adapters and persistence. This includes OpenRouter prompts/embedding access, PDF/Mathpix handling, standards catalog loading, local/session storage, and external-call/stage-time persistence.

React screens live in `../../pages/`, reusable Generate features in `../../features/`, and cross-feature UI/types in `../../shared/`.

## Placement rules

When adding code:

1. Put business rules, parsing, validation, ordering, and calculations in `domain/` when they can be deterministic and side-effect free.
2. Put an operation that coordinates multiple rules/adapters in `application/` and name it after the use case rather than `Utils` or generic `Processing`.
3. Put network, browser storage, DB/API adapter details, PDF/zip handling, and other external I/O in `infrastructure/`.
4. Keep React hooks focused on React state/lifecycle and have them call application services instead of implementing request/storage workflows inline.
5. Do not import one page from another. Extract reusable UI/workflows into `features/` or `shared/` instead.
6. Keep tests colocated with the implementation they verify.
