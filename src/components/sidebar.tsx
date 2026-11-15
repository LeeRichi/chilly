"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUsage } from "@/app/actions";
import type { UsageSnapshot } from "@/lib/usage";
import { IntegrationsPanel } from "./integrations-panel";
import { UsageMeter } from "./usage-meter";
import { PepperIcon } from "./pepper-icon";
import type { IntegrationStatus } from "@/lib/notify";

/** Shared sidebar. Pass `usage` to show live numbers from the current task; otherwise it loads today's totals. */
export function Sidebar({
  usage,
  onIntegrationsChange,
}: {
  usage?: UsageSnapshot | null;
  onIntegrationsChange?: (status: IntegrationStatus) => void;
}) {
  const [own, setOwn] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    if (usage === undefined) void getUsage().then(setOwn);
  }, [usage]);

  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Chilly home">
        <span className="brand-mark" aria-hidden="true">
          <PepperIcon />
        </span>
        <span className="brand-copy">
          chilly<span>ERRANDS, HANDLED</span>
        </span>
      </Link>
      <div className="side-rule" />
      <div className="side-label">API BUDGET · TODAY</div>
      <UsageMeter usage={usage === undefined ? own : usage} />
      <div className="side-label side-gap">CAN ACT THROUGH</div>
      <IntegrationsPanel onStatusChange={onIntegrationsChange} />
      <div className="side-bottom">
        <div className="secure-icon">◈</div>
        <p>
          <b>You stay in charge</b>
          <br />
          Chilly prepares everything. Nothing is sent or saved until you approve.
        </p>
      </div>
    </aside>
  );
}
