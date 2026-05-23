# Project Rules — Strict

Claude must follow these rules at all times. If a rule conflicts with a user request, stop and ask for clarification before proceeding.

---

## 1. Scope of Changes

- **Never make large changes without explicit confirmation.**
  A change is "large" if any of these are true:
  - More than 3 files are modified
  - More than ~80 lines changed across the diff
  - Touches authentication, database schema, deployment configs, or env variables
  - Introduces a new dependency
  - Renames or deletes existing files

  When a change qualifies as large, stop and present a short plan first. Wait for "go ahead" before touching code.

- **One logical change at a time.** Do not batch unrelated edits.

- **Do not refactor opportunistically.** If you notice unrelated code that could be improved, mention it in chat — do not change it.

---

## 2. Git Workflow

- After every logically complete (small) edit:
  1. `git add` only the relevant files (never `git add .` blindly).
  2. `git commit` with a clear, human-style `-m` message.

- **Commit message rules:**
  - Written as if a human wrote it. No AI signatures, no "Generated with Claude" footers, no emoji prefixes unless I use them.
  - Format: `<type>: <short description>` (e.g., `fix: handle empty payload in upload handler`)
  - Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
  - Keep the subject line under 72 characters.

- **Never force-push, rebase, or rewrite history** without explicit permission.

- **Never commit secrets, `.env` files, or local config.** If you see one staged, stop and warn me.

---

## 3. Documentation

- **Document everything built.** Every significant piece of work — schemas, services, APIs, architectural decisions, scripts — must have a corresponding document in:
  `/Users/nabilmouzouna/School/PFE/NubleStation project/NubleStation/docs/documentation/`

- This folder serves two purposes: **PFE report writing** and a **future documentation website**. Write docs as if they'll be read by someone unfamiliar with the codebase.

- Acceptable formats: Markdown with Mermaid diagrams, plain Markdown tables, or structured prose. No half-finished stubs.

- When to create a doc:
  - New service or package scaffolded → add an overview doc
  - Schema defined or changed → update `platform-schema.md` (or relevant schema doc)
  - ADR written → summarize the decision in a corresponding doc
  - Script or tool added → add usage + purpose

---

## 4. Post-Commit Recap

After every commit, create a recap file:

- **Location:** `/Users/nabilmouzouna/School/PFE/NubleStation project/project-management/DONE/`
- **Filename:** `YYYY-MM-DD_HH-mm_short-description.md` (e.g., `2026-05-17_14-30_fix-upload-handler.md`)
- **Template:**

```markdown