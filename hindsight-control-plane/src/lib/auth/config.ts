type ControlPlaneAuth =
  | { mode: "disabled" }
  | { mode: "misconfigured" }
  | { mode: "credentials"; username: string; password: string; sessionSecret: string }
  | { mode: "access-key"; accessKey: string; sessionSecret: string };

export function getControlPlaneAuth(): ControlPlaneAuth {
  const username = process.env.HINDSIGHT_CP_USERNAME?.trim();
  const password = process.env.HINDSIGHT_CP_PASSWORD;

  // A partial account configuration must never silently expose the console or
  // fall back to the legacy shared-key login.
  if (username !== undefined || password !== undefined) {
    if (!username || !password) return { mode: "misconfigured" };
    return {
      mode: "credentials",
      username,
      password,
      // Bind sessions to both credentials so changing either invalidates them.
      sessionSecret: JSON.stringify(["hindsight-cp-credentials", username, password]),
    };
  }

  const accessKey = process.env.HINDSIGHT_CP_ACCESS_KEY;
  if (accessKey) return { mode: "access-key", accessKey, sessionSecret: accessKey };
  return { mode: "disabled" };
}
