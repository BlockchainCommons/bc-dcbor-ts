# Baseline build for the differential harness

`dcbor-baseline.mjs` is the dependency-free ESM bundle of the library built
from commit `187769a273176a2c6089fb412871226b6db1e795`, before the public API
was renamed to its current form. (Its trailing `sourceMappingURL` comment was
removed because the `.map` file is not vendored.)

The differential corpus harness (`tests/differential.test.ts`) encodes every
corpus input with both this baseline and the working tree, asserting
byte-identical output and identical decode outcomes/error codes. The harness
also pins this file's sha256 (`BASELINE_SHA256`) so an accidental rebuild or
copy mishap cannot silently turn the differential into a self-comparison.

Re-baseline only by deliberate decision. Build the recorded commit (never
HEAD) in a detached worktree:

    git worktree add /tmp/dcbor-baseline-build <new-baseline-commit>
    cd /tmp/dcbor-baseline-build && bun install && bun run build
    cp dist/index.mjs <repo>/tests/baseline/dcbor-baseline.mjs
    # strip the trailing sourceMappingURL comment, then update BOTH
    # BASELINE_SHA256 and BASELINE_COMMIT in tests/differential.test.ts
    # and the commit hash in this README - all in one reviewed diff.
    git worktree remove /tmp/dcbor-baseline-build

A new baseline with a different public API also needs its adapter in
`tests/vectors/recipes.ts` (`baselineAdapterFor`) and the type shim in
`dcbor-baseline.d.mts` updated.

Baseline commit: 187769a273176a2c6089fb412871226b6db1e795
Baseline sha256: ffb0bf6acdafaf01fbb6360497f96cb0f821d4d602f6f343cddd507a302fb72c
