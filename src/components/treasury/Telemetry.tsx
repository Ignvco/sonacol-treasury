import { useEffect } from "react";
import { treasuryRpc } from "@/services/decisionService";
/** Only a fixed error code and route: no messages, tokens, records or query strings. */
export function Telemetry() {
  useEffect(() => {
    let last = 0;
    const report = () => {
      if (Date.now() - last < 10000) return;
      last = Date.now();
      const path = window.location.pathname;
      if (/^\/[a-z/]*$/.test(path))
        void treasuryRpc("treasury_report_error", {
          p_code: "UNHANDLED",
          p_path: path,
        }).catch(() => undefined);
    };
    window.addEventListener("error", report);
    window.addEventListener("unhandledrejection", report);
    return () => {
      window.removeEventListener("error", report);
      window.removeEventListener("unhandledrejection", report);
    };
  }, []);
  return null;
}
