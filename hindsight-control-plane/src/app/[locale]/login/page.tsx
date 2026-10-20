import { Suspense } from "react";
import { getControlPlaneAuth } from "@/lib/auth/config";
import LoginForm from "./login-form";

// Credentials are supplied when the container starts, not when the UI is built.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const auth = getControlPlaneAuth();
  return (
    <Suspense>
      <LoginForm authMode={auth.mode === "access-key" ? "access-key" : "credentials"} />
    </Suspense>
  );
}
