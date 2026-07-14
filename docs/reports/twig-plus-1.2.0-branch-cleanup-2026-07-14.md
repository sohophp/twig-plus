# TwigPlus 1.2.0 branch cleanup audit — 2026-07-14

## Release gates

Cleanup began only after all release gates passed:

- PR #15 CI run `29321484251`, release-commit `master` CI run `29321752834`, report PR #16 CI run `29322217556`, and final report `master` CI run `29322385924` completed successfully.
- `v1.2.0` peels to release commit `a63668b1b416bfd05a6b003f129e870b1f2d7f93`.
- The GitHub Release asset is 9,402,772 bytes with SHA-256 `44c0560b2c9bfb2b9b52c49bddea0dd2a2875c3cd5a9ce6fb9fdf20f02b8b032`.
- Marketplace listed version `1.2.0`. Its public version-specific endpoint returned HTTP 200; the decoded manifest, size, and SHA-256 exactly matched the CI and GitHub Release asset.
- `master` was the default and only protected branch. Every deletion candidate was unprotected and had a merged PR.

## Deletion inventory

The following values were captured before deletion. A differing local tip is shown after the remote tip.

| Branch | Remote tip / local tip | Merged PR and merge commit | Absorption evidence |
| --- | --- | --- | --- |
| `fix/javascript-completion-enter` | `240090ed` / same | #13 `571827ea`, #14 `3c2795ad` | Combined branch and merged patches from `41b4e94c` were identical (`af0a122e`). |
| `refactor/hybrid-native-phpstorm` | `bdd71eb4` / same | #3 `738dcaf7`, #4 `e6affa39` | Aggregate patches matched exactly (`597bc738`, `a0badab5`). |
| `refactor/legacy-removal-readiness` | `3a7618e3` / same | #11 `90add529` | Aggregate patch matched exactly (`a169d32f`). |
| `refactor/phpstorm-editing-parity` | `551a21a8` / `a49b6346` | #8 `c5c41d7b`, then stacked #9/#10 | #8 patch matched (`1075239e`); remote tree equaled the #9 head tree; #10's aggregate matched `master`. |
| `refactor/remove-legacy-parser` | `260775bf` / same | #12 `41b4e94c`, follow-up absorbed by #13/#14 | #12 patch matched (`ed29d58a`); the extra tip patch equaled the JavaScript completion patch included by #13/#14. |
| `refactor/symfony-twig-reference` | `129cf13c` / same | #9 `551a21a8`, then stacked #10 | Tip tree equaled #9's merged tree; #9 (`7293ebe2`) and #10 aggregate patches matched. |
| `refactor/twig-conformance-release` | `b0c490e2` / same | #10 `017f482f` | Aggregate patch matched exactly (`f64e8d21`). |
| `refactor/twig-parser-conformance` | `c5c41d7b` / `f5510968` | #7 `14f383cb`, then stacked #8/#10 | #7 patch matched (`5d59fc2e`); remote tree equaled #8's head tree; #10 aggregate matched. |
| `refactor/twig-spec-v2` | `14f383cb` / `077af6b7` | #6 `d8445008`, then stacked #7/#10 | #6 patch matched (`1dc4e816`); remote tree equaled #7's head tree; #10 aggregate matched. |
| `agent/release-twigplus-1.2.0` | `b3c24b0f` / same | #15 `a63668b1` | Aggregate patch matched exactly (`4ef49b83`); tagged and published artifact was verified. |
| `agent/document-twigplus-1.2.0-release` | `81c5fb0b` / same | #16 `791085e8` | Aggregate patch matched exactly (`a034d60f`); final `master` CI passed. |
| `agent/release-twigplus-1.0.4` | upstream absent / `6372003a` | #1/#2; tag `v1.1.2` | Local tip was already an ancestor of `master` and remains reachable through `v1.1.2`. |

The 11 existing remote branches were deleted first. The corresponding local branches and the local-only stale release branch were then deleted after the patch/tree checks above, followed by `git fetch --prune`.

## Preserved tags

| Tag | Peeled commit |
| --- | --- |
| `v1.0.0` | `afaf313670dd09724cffdfdd85f2f8c746d0b553` |
| `v1.0.1` | `8d2620b8d8c29843b167c58218eae977e8689a72` |
| `v1.0.4` | `00b2e81319939d4d15d5c06607e4dfb362764c2e` |
| `v1.0.5` | `7323922b7b1d6073c56398c7fe14ff3587d43c7d` |
| `v1.1.0` | `f460302f460a3848bc36476f51df255395f4fbd6` |
| `v1.1.1` | `10093502fec25d3773ecbb6fb5d7a0de7ae58d26` |
| `v1.1.2` | `6372003af366ddc102951b26dd105d7c944bc4ad` |
| `v1.2.0` | `a63668b1b416bfd05a6b003f129e870b1f2d7f93` |

After pruning, the local branch list and remote head list each contained only `master`. No tag was deleted, moved, or recreated.
