import { useEffect, useId, useRef, useState } from "react";
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
  confirmationLabel = "Ketik frasa konfirmasi",
  expectedConfirmation = "",
  acknowledgementLabel = "",
  countdownSeconds = 0,
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
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [validationError, setValidationError] = useState("");
  const submitLockRef = useRef(false);
  const isPending = pending || busy;
  const mustProvideReason = reasonRequired || requireReason;
  const close = onCancel || onClose || (() => {});
  const requiresTypedConfirmation = Boolean(expectedConfirmation);
  const requiresAcknowledgement = Boolean(acknowledgementLabel);

  useEffect(() => {
    if (!open) return undefined;
    setReason("");
    setConfirmation("");
    setAcknowledged(false);
    submitLockRef.current = false;
    setValidationError("");
    setRemainingSeconds(Math.max(0, Number(countdownSeconds || 0)));
    if (!countdownSeconds) return undefined;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdownSeconds, open]);

  const confirmationReady = !requiresTypedConfirmation || confirmation === expectedConfirmation;
  const acknowledgementReady = !requiresAcknowledgement || acknowledged;
  const confirmDisabled = isPending || remainingSeconds > 0 || !confirmationReady || !acknowledgementReady;

  const submit = async (event) => {
    event.preventDefault();
    const normalized = reason.trim();
    if (mustProvideReason && !normalized) {
      setValidationError(`${reasonLabel || "Alasan"} wajib diisi.`);
      return;
    }
    if (!confirmationReady) {
      setValidationError("Frasa konfirmasi belum sesuai.");
      return;
    }
    if (!acknowledgementReady) {
      setValidationError("Pernyataan pemahaman wajib dicentang.");
      return;
    }
    if (remainingSeconds > 0 || submitLockRef.current) return;
    submitLockRef.current = true;
    setValidationError("");
    try {
      await onConfirm(normalized, { confirmation, acknowledged });
    } finally {
      submitLockRef.current = false;
    }
  };

  const blockAccidentalEnter = (event) => {
    if (!requiresTypedConfirmation || event.key !== "Enter" || event.target.tagName === "TEXTAREA") return;
    event.preventDefault();
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
          <Button type="submit" form={formId} variant={tone === "danger" ? "danger" : "primary"} disabled={confirmDisabled}>
            {isPending ? "Memproses..." : remainingSeconds > 0 ? `Tunggu ${remainingSeconds} detik` : confirmLabel}
          </Button>
        </>
      )}
    >
      <form id={formId} className="stack-form" onSubmit={submit} onKeyDown={blockAccidentalEnter}>
        {children}
        {(mustProvideReason || reasonLabel) ? (
          <label className="field">
            <span>{reasonLabel || "Alasan"}{mustProvideReason ? " *" : ""}</span>
            <textarea rows="3" maxLength="200" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={reasonPlaceholder} aria-invalid={Boolean(validationError && mustProvideReason && !reason.trim())} />
          </label>
        ) : null}
        {requiresTypedConfirmation ? (
          <label className="field">
            <span>{confirmationLabel}</span>
            <input autoComplete="off" spellCheck="false" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={expectedConfirmation} aria-describedby={`${formId}-confirmation-help`} />
            <small id={`${formId}-confirmation-help`}>Ketik persis: <strong>{expectedConfirmation}</strong></small>
          </label>
        ) : null}
        {requiresAcknowledgement ? (
          <label className="checkbox-field">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>{acknowledgementLabel}</span>
          </label>
        ) : null}
        {remainingSeconds > 0 ? <div className="notice notice--warning" role="status">Periksa kembali dampaknya. Konfirmasi aktif dalam {remainingSeconds} detik.</div> : null}
        {validationError ? <small className="field__error" role="alert">{validationError}</small> : null}
        {error ? <div className="notice notice--danger" role="alert">{error.message || String(error)}</div> : null}
      </form>
    </Modal>
  );
};

export default ConfirmationModal;
