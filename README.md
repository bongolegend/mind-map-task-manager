# Thinking Map

A personal thinking tool with a single-column drill-down view over theses, bets, tasks, people, and interactions.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- File-backed store in `data/store.json` (no database)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Edits persist to `data/store.json`. If that file is missing, a seed dataset is written on first API load.

## Contributing / agent workflow

- Do not commit to `main` directly.
- Use a `feature/…` or `fix/…` branch, then open a PR into `main`.
- Project rule: `.cursor/rules/git-hygiene.mdc` (always applied for agents in this repo).
