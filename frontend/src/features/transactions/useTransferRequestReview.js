import { useState } from "react";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { reviewTransferApproval } from "./transferRequests.api.js";

export const useTransferRequestReview = ({ transferRequests, invalidate, refreshKeys, transactionResource, refreshOverview, notify }) => {
  const [busyId, setBusyId] = useState("");
  const [unresolvedIntent, setUnresolvedIntent] = useState(null);

  const executeReview = async ({ request, decision, reason = "" }) => {
    setBusyId(request.request_id);
    try {
      const result = await reviewTransferApproval(
        { request_id: request.request_id, row_version: request.row_version, decision, reason },
        { rowVersion: request.row_version },
      );
      setUnresolvedIntent(null);
      notify?.({
        message: decision === "approve" ? "Pengajuan transfer disetujui." : "Pengajuan transfer ditolak.",
        tone: "success",
        dedupeKey: `transfer-review:${decision}:${request.request_id}`,
      });
      await transferRequests.reload();
      if (result?.transaction) {
        invalidate(refreshKeys);
        await Promise.allSettled([transactionResource?.reload?.(), refreshOverview?.()]);
      }
      return { ok: true, outcomeUnknown: false, result };
    } catch (error) {
      const unknown = isOutcomeUnknownError(error);
      if (unknown) {
        setUnresolvedIntent({ request, decision, reason });
        return { ok: false, outcomeUnknown: true, error };
      }
      notify?.({ message: error.message || "Keputusan transfer belum berhasil disimpan.", tone: "danger", dedupeKey: `transfer-review:error:${request.request_id}` });
      return { ok: false, outcomeUnknown: false, error };
    } finally {
      setBusyId("");
    }
  };

  const reviewTransferRequest = (request, decision, reason = "") => executeReview({ request, decision, reason });
  const retryUnresolvedIntent = () => unresolvedIntent ? executeReview(unresolvedIntent) : Promise.resolve({ ok: false, outcomeUnknown: false });

  return { busyId, unresolvedIntent, reviewTransferRequest, retryUnresolvedIntent };
};
