import { useEffect, useMemo, useState } from "react";
import { FiBell, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { formatDateTimeJakarta, todayInJakarta } from "../../domain/dates.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { cancelManualReminder, getManualReminder, saveManualReminder } from "../../services/notifications.js";

const addLocalDays = (dateValue, days) => {
  const parsed = new Date(`${dateValue}T00:00:00+07:00`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed);
};

const localDateTimeParts = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

const defaultForm = (target) => {
  const today = todayInJakarta();
  const suggested = String(target?.suggestedDate || "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(suggested) && suggested > today ? suggested : addLocalDays(today, 1);
  return { date, time: "08:00" };
};

const reminderDescription = (target) => target?.name
  ? `${target.name} · pengingat ini hanya untuk akun Anda.`
  : "Pengingat ini hanya untuk akun Anda.";

const ManualReminderModal = ({ target, onClose }) => {
  const { notify } = useFeedback();
  const saveMutation = useGuardedMutation();
  const cancelMutation = useGuardedMutation();
  const [loadState, setLoadState] = useState({ status: "idle", error: null });
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(() => defaultForm(target));
  const open = Boolean(target);

  useEffect(() => {
    if (!target) return undefined;
    let active = true;
    setLoadState({ status: "loading", error: null });
    setCurrent(null);
    setForm(defaultForm(target));
    getManualReminder({ entityType: target.entityType, entityId: target.entityId })
      .then((result) => {
        if (!active) return;
        const item = result?.item?.reminder_id ? result.item : null;
        setCurrent(item);
        const local = localDateTimeParts(item?.scheduled_at);
        if (local) setForm(local);
        setLoadState({ status: "ready", error: null });
      })
      .catch((error) => {
        if (active) setLoadState({ status: "error", error });
      });
    return () => { active = false; };
  }, [target]);

  const scheduledLocal = useMemo(() => `${form.date}T${form.time}`, [form.date, form.time]);
  const busy = saveMutation.busy || cancelMutation.busy;
  const close = () => { if (!busy) onClose?.(); };

  const save = async (event) => {
    event.preventDefault();
    if (!target || loadState.status !== "ready") return;
    try {
      const result = await saveMutation.run(() => saveManualReminder({
        entityType: target.entityType,
        entityId: target.entityId,
        scheduledLocal,
        rowVersion: current?.row_version || null,
      }));
      setCurrent(result.item);
      notify({ message: "Pengingat manual berhasil dijadwalkan.", tone: "success", dedupeKey: `reminder:${target.entityType}:${target.entityId}` });
    } catch {
      // Error ditampilkan di dialog melalui mutation state.
    }
  };

  const cancel = async () => {
    if (!current) return;
    try {
      await cancelMutation.run(() => cancelManualReminder({ reminderId: current.reminder_id, rowVersion: current.row_version }));
      setCurrent(null);
      setForm(defaultForm(target));
      notify({ message: "Pengingat manual dibatalkan.", tone: "success", dedupeKey: `reminder-cancel:${target.entityType}:${target.entityId}` });
    } catch {
      // Error ditampilkan di dialog melalui mutation state.
    }
  };

  const error = loadState.error || saveMutation.error || cancelMutation.error;
  const activeLabel = current?.scheduled_at ? formatDateTimeJakarta(current.scheduled_at) : "";
  const footer = <>
    {current ? <Button type="button" variant="danger" icon={FiTrash2} loading={cancelMutation.busy} disabled={busy || loadState.status !== "ready"} onClick={cancel}>Batalkan pengingat</Button> : null}
    <Button type="button" disabled={busy} onClick={close}>Tutup</Button>
    <Button type="submit" form="manual-reminder-form" variant="primary" icon={FiBell} loading={saveMutation.busy} disabled={busy || loadState.status !== "ready"}>{current ? "Ubah jadwal" : "Simpan pengingat"}</Button>
  </>;

  return <Modal
    open={open}
    title="Pengingat manual"
    description={reminderDescription(target)}
    onClose={close}
    dismissible={!busy}
    mobileSwipeToClose
    size="sm"
    footer={footer}
  >
    <form id="manual-reminder-form" className="form-grid" onSubmit={save}>
      <div className="notice notice--info form-grid__full" role="status">
        <strong>{current ? "Pengingat aktif" : "Atur waktu sendiri"}</strong>
        <span>{current ? `Saat ini dijadwalkan ${activeLabel}.` : "Pengingat otomatis tetap berjalan. Pengingat ini menjadi tambahan khusus untuk Anda."}</span>
      </div>
      <label className="field">
        <span>Tanggal *</span>
        <input required type="date" min={todayInJakarta()} value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} disabled={busy || loadState.status !== "ready"} />
      </label>
      <label className="field">
        <span>Waktu *</span>
        <input required type="time" value={form.time} onChange={(event) => setForm((value) => ({ ...value, time: event.target.value }))} disabled={busy || loadState.status !== "ready"} />
      </label>
      <p className="field-hint form-grid__full">Zona waktu Asia/Jakarta. Notifikasi dikirim oleh scheduler saat waktunya tiba dan tidak menggantikan pengingat otomatis.</p>
      {loadState.status === "loading" ? <div className="notice notice--info form-grid__full">Memuat pengingat...</div> : null}
      {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message || "Pengingat tidak dapat diproses."}</div> : null}
    </form>
  </Modal>;
};

export default ManualReminderModal;
