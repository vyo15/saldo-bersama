import { useEffect, useId, useState } from "react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

const ConfirmationModal = ({
  open,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  reasonLabel = null,
  reasonPlaceholder = "",
  reasonRequired = false,
  requireReason = false,
  pending = false,
  busy = false,
  error = null,
  tone = "danger",
  children,
  onClose,
  onCancel,
  onConfirm,
}) => {
  const formId = useId();
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");
  const isPending = pending || busy;
  const mustProvideReason = reasonRequired || requireReason;
  const close = onCancel || onClose;

  useEffect(() => {
    if (open) {
      setReason("");
      setValidationError("");
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    const normalized = reason.trim();
    if (mustProvideReason && !normalized) {
      setValidationError(`${reasonLabel || "Alasan"} wajib diisi.`);
      return;
    }
    setValidationError("");
    await onConfirm(normalized);
  };

  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : close}
      title={title}
      description={description}
      size="sm"
      footer={(
        <>
          <Button type="button" onClick={close} disabled={isPending}>{cancelLabel}</Button>
          <Button type="submit" form={formId} variant={tone === "danger" ? "danger" : "primary"} disabled={isPending}>
            {isPending ? "Memproses..." : confirmLabel}
          </Button>
        </>
      )}
    >
      <form id={formId} className="stack-form" onSubmit={submit}>
        {children}
        {(mustProvideReason || reasonLabel) ? (
          <label className="field">
            <span>{reasonLabel || "Alasan"}{mustProvideReason ? " *" : ""}</span>
            <textarea rows="3" maxLength="200" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={reasonPlaceholder} aria-invalid={Boolean(validationError)} />
            {validationError ? <small className="field__error">{validationError}</small> : null}
          </label>
        ) : null}
        {error ? <div className="notice notice--danger" role="alert">{error.message || String(error)}</div> : null}
      </form>
    </Modal>
  );
};

export default ConfirmationModal;
