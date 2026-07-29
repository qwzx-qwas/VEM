export interface WorkspaceIdentity {
  readonly packageName: "@vem/workspace-smoke";
  readonly stage: "P0-T1";
  readonly privatePackage: true;
}

export function workspaceIdentity(): WorkspaceIdentity {
  return {
    packageName: "@vem/workspace-smoke",
    stage: "P0-T1",
    privatePackage: true,
  };
}
