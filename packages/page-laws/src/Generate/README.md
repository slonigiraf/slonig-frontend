# Generate

`Generate` is organized by responsibility rather than by file type:

- `book/` — the book-generation domain, application use cases, and infrastructure adapters. See [`book/README.md`](./book/README.md).
- `pages/` — route/screen composition and page-local React state.
- `features/` — reusable product features that can be embedded by multiple pages. `skills/` lives here because Book Workspace embeds it directly.
- `shared/` — cross-feature UI primitives and neutral TypeScript contracts.

Avoid introducing top-level `components/`, `Utils.ts`, or generic `Processing.ts` buckets. Put code next to the feature that owns it, or in the narrowest `book` layer when it implements generation behavior.
