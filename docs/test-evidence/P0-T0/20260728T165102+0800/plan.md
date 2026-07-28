# P0-T0A1 Migration Plan

1. Freeze the owner-authorized staging payload without stashing or discarding changes.
2. Clone baseline history into the ext4 target without checking out the nested tree.
3. Copy every payload file to its prefix-normalized project-at-root path.
4. Commit the layout with sourceBaselineHead as its parent.
5. Revalidate source freeze, target parity, Git root, no nesting, and clean worktree.
6. Add a reversible Windows ACL deny-write ACE for the owner SID to staging.
7. Prove staging rejects writes, mark target canonical, and commit completion evidence.

Rollback before cutover: remove the partial target only after confirming staging is unchanged.
Rollback after cutover: run the recorded icacls /remove:d command, verify staging write access,
and quarantine the target before restoring staging as writer.
