import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

const confirmationValidationMessage = ({ mustProvideReason, normalizedReason, confirmationReady, acknowledgementReady, reasonLabel }) => {
  if (mustProvideReason && !normalizedReason) return `${reasonLabel || "Alasan"} wajib diisi.`;
  if (!confirmationReady) return "Frasa konfirmasi belum sesuai.";
  if (!acknowledgementReady) return "Pernyataan pemahaman wajib dicentang.";
  return "";
};

const useCountdownReset = (open, countdownSeconds, setters, submitLockRef) => {
  useEffect(() => {
    if (!open) return undefined;
    setters.setReason("");
    setters.setConfirmation("");
    setters.setAcknowledged(false);
    submitLockRef.current = false;
    setters.setValidationError("");
    setters.setRemainingSeconds(Math.max(0, Number(countdownSeconds || 0)));
    if (!countdownSeconds) return undefined;
    const timer = window.setInterval(() => {
      setters.setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdownSeconds, open, setters, submitLockRef]);
};

const ConfirmationFields = ({
  formId,
  children,
  reason,
  setReason,
  reasonLabel,
  reasonPlaceholder,
  mustProvideReason,
  confirmation,
  setConfirmation,
  confirmationLabel,
  expectedConfirmation,
  requiresTypedConfirmation,
  acknowledged,
  setAcknowledged,
  acknowledgementLabel,
  requiresAcknowledgement,
  remainingSeconds,
  validationError,
  error,
}) => (
  <>
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
  </>
);

const ConfirmationFooter = ({ close, isPending, formId, tone, confirmDisabled, remainingSeconds, confirmLabel, cancelLabel }) => (
  <>
    <Button type="button" onClick={close} disabled={isPending}>{cancelLabel}</Button>
    <Button type="submit" form={formId} variant={tone === "danger" ? "danger" : "primary"} disabled={confirmDisabled}>
      {isPending ? "Memproses..." : remainingSeconds > 0 ? `Tunggu ${remainingSeconds} detik` : confirmLabel}
    </Button>
  </>
);

const submitConfirmation = async ({
  event, reason, mustProvideReason, confirmationReady, acknowledgementReady, reasonLabel,
  remainingSeconds, submitLockRef, setValidationError, onConfirm, confirmation, acknowledged,
}) => {
  event.preventDefault();
  const normalized = reason.trim();
  const validationMessage = confirmationValidationMessage({ mustProvideReason, normalizedReason: normalized, confirmationReady, acknowledgementReady, reasonLabel });
  if (validationMessage) {
    setValidationError(validationMessage);
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

const blockConfirmationEnter = (event, requiresTypedConfirmation) => {
  if (!requiresTypedConfirmation || event.key !== "Enter" || event.target.tagName === "TEXTAREA") return;
  event.preventDefault();
};

const resolveConfirmationState = ({
  pending, busy, reasonRequired, requireReason, onCancel, onClose, expectedConfirmation,
  acknowledgementLabel, confirmation, acknowledged, remainingSeconds,
}) => {
  const isPending = pending || busy;
  const mustProvideReason = reasonRequired || requireReason;
  const close = onCancel || onClose || (() => {});
  const requiresTypedConfirmation = Boolean(expectedConfirmation);
  const requiresAcknowledgement = Boolean(acknowledgementLabel);
  const confirmationReady = !requiresTypedConfirmation || confirmation === expectedConfirmation;
  const acknowledgementReady = !requiresAcknowledgement || acknowledged;
  const confirmDisabled = isPending || remainingSeconds > 0 || !confirmationReady || !acknowledgementReady;
  return { isPending, mustProvideReason, close, requiresTypedConfirmation, requiresAcknowledgement, confirmationReady, acknowledgementReady, confirmDisabled };
};

const ConfirmationModal = (props) => {
  const {
    open, title, description, confirmLabel = "Konfirmasi", cancelLabel = "Batal", reasonLabel = null,
    reasonPlaceholder = "", reasonRequired = false, requireReason = false, confirmationLabel = "Ketik frasa konfirmasi",
    expectedConfirmation = "", acknowledgementLabel = "", countdownSeconds = 0, pending = false, busy = false,
    error = null, tone = "danger", children, onClose, onCancel, onConfirm,
  } = props;
  const formId = useId();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [validationError, setValidationError] = useState("");
  const submitLockRef = useRef(false);
  const setters = { setReason, setConfirmation, setAcknowledged, setRemainingSeconds, setValidationError };
  useCountdownReset(open, countdownSeconds, setters, submitLockRef);

  const {
    isPending, mustProvideReason, close, requiresTypedConfirmation, requiresAcknowledgement,
    confirmationReady, acknowledgementReady, confirmDisabled,
  } = resolveConfirmationState({
    pending, busy, reasonRequired, requireReason, onCancel, onClose, expectedConfirmation,
    acknowledgementLabel, confirmation, acknowledged, remainingSeconds,
  });

  const submit = (event) => submitConfirmation({
    event, reason, mustProvideReason, confirmationReady, acknowledgementReady, reasonLabel,
    remainingSeconds, submitLockRef, setValidationError, onConfirm, confirmation, acknowledged,
  });
  const blockAccidentalEnter = (event) => blockConfirmationEnter(event, requiresTypedConfirmation);

  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : close}
      title={title}
      description={description}
      size="sm"
      footer={<ConfirmationFooter close={close} isPending={isPending} formId={formId} tone={tone} confirmDisabled={confirmDisabled} remainingSeconds={remainingSeconds} confirmLabel={confirmLabel} cancelLabel={cancelLabel} />}
    >
      <form id={formId} className="stack-form" onSubmit={submit} onKeyDown={blockAccidentalEnter}>
        <ConfirmationFields
          formId={formId}
          children={children}
          reason={reason}
          setReason={setReason}
          reasonLabel={reasonLabel}
          reasonPlaceholder={reasonPlaceholder}
          mustProvideReason={mustProvideReason}
          confirmation={confirmation}
          setConfirmation={setConfirmation}
          confirmationLabel={confirmationLabel}
          expectedConfirmation={expectedConfirmation}
          requiresTypedConfirmation={requiresTypedConfirmation}
          acknowledged={acknowledged}
          setAcknowledged={setAcknowledged}
          acknowledgementLabel={acknowledgementLabel}
          requiresAcknowledgement={requiresAcknowledgement}
          remainingSeconds={remainingSeconds}
          validationError={validationError}
          error={error}
        />
      </form>
    </Modal>
  );
};

export default ConfirmationModal;
