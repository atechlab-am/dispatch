# Tests Update Rule

Always add or update tests when:
- Adding a new component or feature
- Changing existing behaviour (pricing logic, status transitions, PDF output)
- Fixing a bug (add a regression test)

Test location: `src/__tests__/`
Runner: `npm test` (Vitest + React Testing Library)

No shipping a feature without a test. If a test is impractical (e.g. browser print API), mock it and assert the mock was called with correct args.
