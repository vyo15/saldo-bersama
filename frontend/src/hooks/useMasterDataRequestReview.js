import { useState } from "react";
import { isOutcomeUnknownError } from "../services/api/errors.js";
import { reviewMasterDataRequest } from "../services/masterDataRequests.js";

export const useMasterDataRequestReview = ({ requestsResource, reloadApproved, notify, entityLabel, dedupePrefix }) => {
  const [busyId, setBusyId] = useState("");
  const [unresolvedIntent, setUnresolvedIntent] = useState(null);

  const executeReview = async ({ request, decision, reason = "" }) => {
    setBusyId(request.request_id);
    try {
      await reviewMasterDataRequest(
        { request_id: request.request_id, decision, reason, row_version: request.row_version },
        { rowVersion: request.row_version },
      );
      setUnresolvedIntent(null);
      notify({
        message: decision === "approve" ? `Pengajuan ${entityLabel} disetujui.` : `Pengajuan ${entityLabel} ditolak.`,
        tone: "success",
        dedupeKey: `${dedupePrefix}:${decision}:${request.request_id}`,
      });
      await Promise.allSettled([
        requestsResource.reload(),
        decision === "approve" ? reloadApproved() : Promise.resolve(),
      ]);
      return { ok: true, outcomeUnknown: false };
    } catch (error) {
      const unknown = isOutcomeUnknownError(error);
      if (unknown) {
        setUnresolvedIntent({ request, decision, reason });
        return { ok: false, outcomeUnknown: true, error };
      }
      notify({ message: error.message, tone: "danger", dedupeKey: `${dedupePrefix}:error:${request.request_id}` });
      return { ok: false, outcomeUnknown: false, error };
    } finally {
      setBusyId("");
    }
  };

  const reviewRequest = (request, decision, reason = "") => executeReview({ request, decision, reason });
  const retryUnresolvedIntent = () => unresolvedIntent ? executeReview(unresolvedIntent) : Promise.resolve({ ok: false, outcomeUnknown: false });

  return { busyId, unresolvedIntent, reviewRequest, retryUnresolvedIntent };
};
