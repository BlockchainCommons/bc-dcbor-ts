# Frozen baseline build (P1.1 differential harness)

`dcbor-baseline.mjs` is the dependency-free ESM bundle of dcbor-ts built from
commit `187769a273176a2c6089fb412871226b6db1e795` - the frozen pre-redesign
wire-format reference. (Its trailing `sourceMappingURL` comment was removed
because the `.map` file is not vendored.)

The differential corpus harness (`tests/differential.test.ts`) encodes every
corpus input with BOTH this baseline and the working tree, asserting
byte-identical output and identical decode outcomes/error codes. The harness
also pins this file's sha256 (`BASELINE_SHA256`) so an accidental rebuild or
copy mishap cannot silently turn the differential into a self-comparison.

Do NOT regenerate this file during the API redesign. It is only re-baselined
at P4.1 (proof re-baseline), by deliberate decision. To re-baseline, build the
RECORDED COMMIT (never HEAD) in a detached worktree:

    git worktree add /tmp/dcbor-baseline-build <new-baseline-commit>
    cd /tmp/dcbor-baseline-build && bun install && bun run build
    cp dist/index.mjs <repo>/tests/baseline/dcbor-baseline.mjs
    # strip the trailing sourceMappingURL comment, then update BOTH
    # BASELINE_SHA256 and BASELINE_COMMIT in tests/differential.test.ts
    # and the commit hash in this README - all in one reviewed diff.
    git worktree remove /tmp/dcbor-baseline-build

Baseline commit: 187769a273176a2c6089fb412871226b6db1e795
Baseline sha256: ffb0bf6acdafaf01fbb6360497f96cb0f821d4d602f6f343cddd507a302fb72c
