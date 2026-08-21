# Repository Agent Instructions

## CodeGraph

When a `.codegraph/` directory exists at the repository root, use CodeGraph as the first tool for understanding or locating code across the repository.

- Prefer the `codegraph_explore` MCP tool when it is available.
- If the MCP tool is unavailable, use `codegraph explore "<question, flow, file, or symbol>"` from the repository root.
- Use `codegraph query`, `codegraph callers`, `codegraph callees`, and `codegraph impact` for focused symbol and dependency questions.
- Check index health with `codegraph status`. Run `codegraph sync` before relying on dependency results when the index reports pending changes.
- Treat source returned by `codegraph explore` as already read; do not immediately re-read the same files unless verification is necessary.
- Fall back to `rg`, filesystem search, and direct file reads when CodeGraph has no relevant result or the content is not indexed.

If `.codegraph/` does not exist, skip CodeGraph. Do not initialize or rebuild an index unless the user requests it.
