# Contributing

Issues and pull requests are welcome.

- Read [AGENTS.md](./AGENTS.md): the layout, the commands, and the rules (pure logic stays testable, and you write tests first).
- Before sending a pull request, run `npm test` and `npm run build`. If you changed the docs, also run `node scripts/sync-docs.mjs`.
- If you change behaviour, check it in the example's preview (`npm run example`).
