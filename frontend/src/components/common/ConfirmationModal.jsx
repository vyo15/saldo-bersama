import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

const EMPTY_ACKNOWLEDGEMENT_ITEMS = Object.freeze([]);

const confirmationValidationMessage = ({ mustProvideReason, normalizedReason, confirmationReady, acknowledgementReady, reasonLabel }) => {
  if (mustProvideReason && !normalizedReason) return `${reasonLabel || "Alasan"} wajib diisi.`;
  if (!confirmationReady) return "Frasa konfirmasi belum sesuai.";
  if (!acknowledgementReady) return "Seluruh pernyataan pemahaman wajib diselesaikan.";
  return "";
};

const confirmationRequirementHint = ({ remainingSeconds, reasonReady, confirmationReady, acknowledgementReady }) => {
  if (remainingSeconds > 0) return `Konfirmasi aktif dalam ${remainingSeconds} detik.`;
  if (!reasonReady) return "Isi alasan tindakan untuk mengaktifkan tombol.";
  if (!confirmationReady) return "Selesaikan frasa konfirmasi untuk mengaktifkan tombol.";
  if (!acknowledgementReady) return "Selesaikan verifikasi pemahaman untuk mengaktifkan tombol.";
  return "";
};

const useCountdownReset = ({
  open, countdownSeconds, acknowledgementItems, setReason, setConfirmation, setAcknowledged, setAcknowledgedItems,
  setRemainingSeconds, setValidationError, submitLockRef,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    setReason("");
    setConfirmation("");
    setAcknowledged(false);
    setAcknowledgedItems(acknowledgementItems.map(() => false));
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
  }, [acknowledgementItems, countdownSeconds, open, setAcknowledged, setAcknowledgedItems, setConfirmation, setReason, setRemainingSeconds, setValidationError, submitLockRef]);
};

const AcknowledgementChecklist = ({ items, checkedItems, setCheckedItems }) => {
  const completed = checkedItems.filter(Boolean).length;
  return (
    <fieldset className="confirmation-checklist">
      <legend>Sebelum melanjutkan</legend>
      <div className="confirmation-checklist__progress" role="status" aria-live="polite">
        <span>{completed}/{items.length} verifikasi selesai</span>
        <span aria-hidden="true">{completed === items.length ? "Siap" : "Wajib"}</span>
      </div>
      <div className="confirmation-checklist__items">
        {items.map((item, index) => {
          const checked = Boolean(checkedItems[index]);
          return (
            <label className={`confirmation-checklist__item${checked ? " is-checked" : ""}`} key={`${index}-${item}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const nextChecked = event.currentTarget.checked;
                  setCheckedItems((current) => Array.from(
                    { length: items.length },
                    (_, itemIndex) => itemIndex === index ? nextChecked : Boolean(current[itemIndex]),
                  ));
                }}
              />
              <span className="confirmation-checklist__marker" aria-hidden="true">{checked ? "✓" : index + 1}</span>
              <span>{item}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
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
  acknowledgementItems,
  acknowledgedItems,
  setAcknowledgedItems,
  requiresAcknowledgement,
  requirementHint,
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
        <input
          autoComplete="off"
          spellCheck="false"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={expectedConfirmation}
          aria-describedby={`${formId}-confirmation-help`}
          aria-invalid={Boolean(confirmation && confirmation !== expectedConfirmation)}
        />
        <small id={`${formId}-confirmation-help`}>Ketik persis: <strong>{expectedConfirmation}</strong></small>
      </label>
    ) : null}
    {acknowledgementItems.length ? (
      <AcknowledgementChecklist items={acknowledgementItems} checkedItems={acknowledgedItems} setCheckedItems={setAcknowledgedItems} />
    ) : requiresAcknowledgement ? (
      <label className="checkbox-field">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        <span>{acknowledgementLabel}</span>
      </label>
    ) : null}
    {requirementHint ? <div className="notice notice--warning">{requirementHint}</div> : null}
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
  remainingSeconds, submitLockRef, setValidationError, onConfirm, confirmation,
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
    await onConfirm(normalized, { confirmation, acknowledged: acknowledgementReady });
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
  acknowledgementLabel, acknowledgementItems, reason, confirmation, acknowledged, acknowledgedItems, remainingSeconds,
}) => {
  const isPending = pending || busy;
  const mustProvideReason = reasonRequired || requireReason;
  const close = onCancel || onClose || (() => {});
  const requiresTypedConfirmation = Boolean(expectedConfirmation);
  const requiresAcknowledgement = Boolean(acknowledgementLabel) || acknowledgementItems.length > 0;
  const reasonReady = !mustProvideReason || Boolean(reason.trim());
  const confirmationReady = !requiresTypedConfirmation || confirmation === expectedConfirmation;
  const checklistReady = acknowledgementItems.length > 0 && acknowledgedItems.length === acknowledgementItems.length && acknowledgedItems.every(Boolean);
  const acknowledgementReady = !requiresAcknowledgement || (acknowledgementItems.length ? checklistReady : acknowledged);
  const confirmDisabled = isPending || remainingSeconds > 0 || !reasonReady || !confirmationReady || !acknowledgementReady;
  return { isPending, mustProvideReason, close, requiresTypedConfirmation, requiresAcknowledgement, reasonReady, confirmationReady, acknowledgementReady, confirmDisabled };
};

const ConfirmationModal = (props) => {
  const {
    open, title, description, confirmLabel = "Konfirmasi", cancelLabel = "Batal", reasonLabel = null,
    reasonPlaceholder = "", reasonRequired = false, requireReason = false, confirmationLabel = "Ketik frasa konfirmasi",
    expectedConfirmation = "", acknowledgementLabel = "", acknowledgementItems: acknowledgementItemsProp = EMPTY_ACKNOWLEDGEMENT_ITEMS, countdownSeconds = 0, pending = false, busy = false,
    error = null, tone = "danger", children, onClose, onCancel, onConfirm,
  } = props;
  const formId = useId();
  const acknowledgementItems = useMemo(
    () => (Array.isArray(acknowledgementItemsProp) ? acknowledgementItemsProp.filter(Boolean) : EMPTY_ACKNOWLEDGEMENT_ITEMS),
    [acknowledgementItemsProp],
  );
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgedItems, setAcknowledgedItems] = useState([]);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [validationError, setValidationError] = useState("");
  const submitLockRef = useRef(false);
  useCountdownReset({
    open, countdownSeconds, acknowledgementItems, setReason, setConfirmation, setAcknowledged, setAcknowledgedItems,
    setRemainingSeconds, setValidationError, submitLockRef,
  });

  const {
    isPending, mustProvideReason, close, requiresTypedConfirmation, requiresAcknowledgement,
    reasonReady, confirmationReady, acknowledgementReady, confirmDisabled,
  } = resolveConfirmationState({
    pending, busy, reasonRequired, requireReason, onCancel, onClose, expectedConfirmation,
    acknowledgementLabel, acknowledgementItems, reason, confirmation, acknowledged, acknowledgedItems, remainingSeconds,
  });

  const requirementHint = confirmationRequirementHint({ remainingSeconds, reasonReady, confirmationReady, acknowledgementReady });
  const countdownAnnouncement = countdownSeconds > 0
    ? remainingSeconds > 0
      ? "Tombol konfirmasi akan aktif setelah jeda keamanan."
      : "Jeda keamanan selesai. Lanjutkan verifikasi yang diperlukan."
    : "";
  const submit = (event) => submitConfirmation({
    event, reason, mustProvideReason, confirmationReady, acknowledgementReady, reasonLabel,
    remainingSeconds, submitLockRef, setValidationError, onConfirm, confirmation,
  });
  const blockAccidentalEnter = (event) => blockConfirmationEnter(event, requiresTypedConfirmation);

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!isPending}
      title={title}
      description={description}
      size="sm"
      footer={<ConfirmationFooter close={close} isPending={isPending} formId={formId} tone={tone} confirmDisabled={confirmDisabled} remainingSeconds={remainingSeconds} confirmLabel={confirmLabel} cancelLabel={cancelLabel} />}
    >
      <form id={formId} className="stack-form" onSubmit={submit} onKeyDown={blockAccidentalEnter}>
        {countdownAnnouncement ? <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{countdownAnnouncement}</span> : null}
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
          acknowledgementItems={acknowledgementItems}
          acknowledgedItems={acknowledgedItems}
          setAcknowledgedItems={setAcknowledgedItems}
          requiresAcknowledgement={requiresAcknowledgement}
          requirementHint={requirementHint}
          validationError={validationError}
          error={error}
        />
      </form>
    </Modal>
  );
};

export default ConfirmationModal;
