import { useRef, useState } from "react";
import { runSettingsAction } from "./settings.api.js";

const DEFAULT_INVALIDATIONS = Object.freeze(["system.health", "audit.list", "reset.status"]);

const defaultIssueText = (count) => `Maintenance tetap aktif. Integrity check menemukan ${count} masalah.`;
const defaultSuccessText = (maintenanceCleared) => maintenanceCleared
  ? "Integrity check lulus dan maintenance berhasil dibuka kembali."
  : "Integrity check lulus. Maintenance sudah tidak aktif.";

export const useMaintenanceRecovery = ({
  invalidate,
  setResult,
  invalidationKeys = DEFAULT_INVALIDATIONS,
  loadingText = "Menjalankan integrity check sebelum membuka maintenance...",
  issueText = defaultIssueText,
  successText = defaultSuccessText,
  onSuccess,
  onFailure,
}) => {
  const busyRef = useRef(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const recoverMaintenance = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRecoveryBusy(true);
    setResult({ status: "loading", text: loadingText });
    try {
      const data = await runSettingsAction("integrity.run", { clearMaintenance: true }, {});
      invalidate(invalidationKeys);
      if (!data.ok) {
        setResult({ status: "danger", text: issueText(data.issues?.length || 0) });
        await onFailure?.(data);
        return;
      }
      setResult({ status: "success", text: successText(Boolean(data.maintenanceCleared)) });
      await onSuccess?.(data);
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      busyRef.current = false;
      setRecoveryBusy(false);
    }
  };

  return { recoveryBusy, recoverMaintenance };
};

export default useMaintenanceRecovery;
