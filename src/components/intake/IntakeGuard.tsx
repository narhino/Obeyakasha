"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IntakeFlow } from "./IntakeFlow";

/** Shows the intake once (until the subject has chosen their name), then the app. */
export function IntakeGuard({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  const [complete, setComplete] = useState(done);
  const router = useRouter();
  if (complete) return <>{children}</>;
  return (
    <IntakeFlow
      onDone={() => {
        setComplete(true);
        router.refresh();
      }}
    />
  );
}
