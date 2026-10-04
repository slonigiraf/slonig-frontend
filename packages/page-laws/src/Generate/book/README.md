# Book generation internals

Book generation remains owned by `@slonigiraf/app-laws`; these folders are internal boundaries, not separate packages.

- `processing/` contains book transformation logic grouped by stage/domain: metadata, source extraction, chapters, concepts, exercises, abilities, and standards.
- `runtime/` contains browser/React execution concerns such as stage timing, resumable progress, shared chapter selection, external-call tracking, pipeline metadata, explicit processing commands, and request orchestration.
- `publishing/` contains the processed-book-to-Laws publishing workflow and JSON construction.
- `prompts/` contains prompts that are specific to book ingestion, metadata detection, or book publishing.

React pages live in `../pages/` and display-only workflow components live in `../components/`. Pages should call into these book modules instead of accumulating new processing or publishing workflows inline.

When adding book functionality, prefer the narrowest existing folder. Keep deterministic transformations in `processing/`, execution/session state in `runtime/`, and chain/IPFS publication decisions in `publishing/`.
