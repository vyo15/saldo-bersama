import { useState } from "react";
import { reviewMasterDataRequest } from "../services/masterDataRequests.js";

export const useMasterDataRequestReview = ({ requestsResource, reloadApproved, notify, entityLabel, dedupePrefix }) => {
  const [busyId, setBusyId] = useState("");

  const reviewRequest = async (request, decision, reason = "") => {
    setBusyId(request.request_id);
    try {
      await reviewMasterDataRequest(
        { request_id: request.request_id, decision, reason, row_version: request.row_version },
        { rowVersion: request.row_version },
      );
      notify({
        message: decision === "approve" ? `Pengajuan ${entityLabel} disetujui.` : `Pengajuan ${entityLabel} ditolak.`,
        tone: "success",
        dedupeKey: `${dedupePrefix}:${decision}:${request.request_id}`,
      });
      await Promise.allSettled([
        requestsResource.reload(),
        decision === "approve" ? reloadApproved() : Promise.resolve(),
      ]);
    } catch (error) {
      notify({ message: error.message, tone: "danger", dedupeKey: `${dedupePrefix}:error:${request.request_id}` });
    } finally {
      setBusyId("");
    }
  };

  return { busyId, reviewRequest };
};
