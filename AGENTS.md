# Agent Instructions

## File permissions

- Do not change file or directory permissions.

## Creating UI

- Before building a new UI element, look for suitable reusable components in:
  - `packages/react-components`
  - `packages/slonig-components`
- Use components from these packages whenever they reasonably meet the requirement. Follow their existing APIs, patterns, and styling conventions.
- Create a custom component only if neither package provides a suitable option, or adapting an existing component would materially compromise the requirement. Keep custom UI consistent with the project's established conventions.
