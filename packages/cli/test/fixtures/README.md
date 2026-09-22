# Fixtures

Redacted copies of real local logs (dev machine, 2026-09-22). All message/tool content, prompts, titles,
`cwd`, git branch and file paths were replaced with placeholders (`<redacted …>`, `/placeholder/project`,
`placeholder-branch`); `world_state`, `compacted`, `toolUseResult`, sandbox/permission blocks and
`base_instructions` were dropped. Token counts, ids and timestamps are unchanged.

| file | source | synthetic edits (for coverage) |
|---|---|---|
| `claude/session.jsonl` | 27 lines of `~/.claude/projects/-Users-carter-dev/21eedb53-….jsonl` | appended: a text-block prompt (01:05), a legacy usage line without `cache_creation` on `claude-opus-5-5`, a `<synthetic>` line, an all-zero usage line, one garbled line |
| `claude/subagents/agent-x.jsonl` | 8 lines of a real `subagents/agent-a0a9….jsonl` (streamed `output_tokens` 1 → 1 → 292 on one message id) | appended: a copy of the parent's `msg_…g7guNa` line (duplicate `message.id:requestId`) |
| `codex/rollout-2026.jsonl` | newest `~/.codex/sessions/2026/09/21/rollout-*.jsonl` (token_usage_record path) | second `turn_context.model` changed to `gpt-5.6-sol`; last line replays the first record's `response_id` |
| `codex/rollout-2025.jsonl` | `~/.codex/archived_sessions/rollout-2025-12-16T21-33-31-….jsonl` (token_count path, includes `info: null` and repeated cumulative totals) | none |
| `gemini/chats/x.json` | hand-written from the SPEC's shape (no Gemini data on the dev machine); m4 uses the real CLI's `type` key instead of `role` | — |

Tests copy these into a temp dir laid out like `~/.claude/projects/<p>/…`, `~/.codex/sessions/…` and
`~/.gemini/tmp/<hash>/chats/`.
