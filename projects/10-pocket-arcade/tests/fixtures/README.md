# Test fixtures, not contributions

`test_validator.py` authors clearly marked synthetic repositories under the
owned `tests/fixture-workspaces/` directory during each test. It removes each
workspace after the test. Nothing is written to system temporary directories.

Their HTML, engine, replay, design and maintenance bytes are **test data only**.
Their command records explicitly say the commands have **not** been executed.
They are never linked from the arcade, listed as real artifacts, used in the
real contribution record, or accepted in real validation mode.

Each synthetic root requires `.pocket-arcade-test-fixture.json`,
`fixtureOnly: true` in its record, and the explicit `--fixture-mode` switch.
Even a successful fixture report has `integrationPassed: false`,
`acceptedLocalContributions: 0` and `accepted-fixture` statuses.

The view-model tests also use synthetic JavaScript objects, never saved as
partner evidence. They check that an unverified or absent contribution cannot
turn the visible integration state into a current pass.

The consumer tests use clearly marked toy score, geometry and receipt objects,
not the real partner artifacts. The real-output assembler refuses marked test
roots. The validator's fixture builder constructs its own record from the
interface contract; it does not copy real received contribution bindings.
