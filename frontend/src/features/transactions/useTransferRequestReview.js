import { useState } from "react";
import { reviewTransferApproval } from "./transferRequests.api.js";

export const useTransferRequestReview = ({ transferRequests, invalidate, refreshKeys, transactionResource, refreshOverview }) => {
  const [busyId, setBusyId] = useState("");

  const reviewTransferRequest = async (request, decision, reason = "") => {
    setBusyId(request.request_id);
    try {
      const result = await reviewTransferApproval(
        { request_id: request.request_id, row_version: request.row_version, decision, reason },
        { rowVersion: request.row_version },
      );
      await transferRequests.reload();
      if (!result?.transaction) return;
      invalidate(refreshKeys);
      await Promise.allSettled([transactionResource?.reload?.(), refreshOverview?.()]);
    } finally {
      setBusyId("");
    }
  };

  return { busyId, reviewTransferRequest };
};
