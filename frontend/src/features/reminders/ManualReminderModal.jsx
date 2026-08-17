import { useEffect, useMemo, useState } from "react";
import { FiBell, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { formatDateTimeJakarta, todayInJakarta } from "../../domain/dates.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { cancelManualReminder, getManualReminder, getPushNotificationState, saveManualReminder } from "../../services/notifications.js";

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

const dispatchNotice = (dispatch) => {
  if (!dispatch) return null;
  const presentations = {
    sent: { tone: "success", title: "Pengingat sebelumnya selesai dikirim", message: "Anda dapat membuat jadwal baru untuk objek ini." },
    dead_letter: { tone: "danger", title: "Pengingat sebelumnya gagal dikirim", message: "Pengiriman sudah dihentikan setelah percobaan terbatas. Anda dapat membuat jadwal baru." },
    failed: { tone: "warning", title: "Pengingat sebelumnya sedang dicoba ulang", message: "Tunggu hasil pengiriman sebelum membuat jadwal baru agar notifikasi tidak ganda." },
    pending: { tone: "info", title: "Pengingat sebelumnya menunggu pengiriman", message: "Tunggu sampai proses pengiriman selesai sebelum membuat jadwal baru." },
    processing: { tone: "info", title: "Pengingat sebelumnya sedang dikirim", message: "Tunggu sampai proses pengiriman selesai sebelum membuat jadwal baru." },
    missing: { tone: "warning", title: "Status pengiriman belum dapat dipastikan", message: "Muat ulang beberapa saat lagi sebelum membuat jadwal baru." },
  };
  return presentations[dispatch.status] || null;
};

const pushAvailabilityMessage = (state) => {
  if (!state || state.enabled) return null;
  if (state.reason === "server_status_unavailable") {
    return "Status Web Push belum dapat diverifikasi. Pengingat tetap disimpan; periksa Pengaturan > Notifikasi untuk memastikan perangkat penerima aktif.";
  }
  if (Number(state.activeDeviceCount || 0) > 0) {
    return "Notifikasi pada perangkat ini belum aktif. Pengingat tetap dapat dikirim ke perangkat lain yang masih terdaftar pada akun Anda.";
  }
  return "Belum ada perangkat aktif untuk Web Push. Pengingat tetap disimpan, tetapi notifikasi tidak akan muncul sampai Web Push diaktifkan pada salah satu perangkat.";
};

const useReminderLoader = (target) => {
  const [loadState, setLoadState] = useState({ status: "idle", error: null });
  const [current, setCurrent] = useState(null);
  const [lastDispatch, setLastDispatch] = useState(null);
  const [pushState, setPushState] = useState(null);
  const [form, setForm] = useState(() => defaultForm(target));

  useEffect(() => {
    if (!target) return undefined;
    let active = true;
    setLoadState({ status: "loading", error: null });
    setCurrent(null);
    setLastDispatch(null);
    setPushState(null);
    setForm(defaultForm(target));
    getPushNotificationState().then((state) => { if (active) setPushState(state); }).catch(() => {
      if (active) setPushState({ enabled: false, reason: "server_status_unavailable", activeDeviceCount: 0 });
    });
    getManualReminder({ entityType: target.entityType, entityId: target.entityId })
      .then((result) => {
        if (!active) return;
        const item = result?.item?.reminder_id ? result.item : null;
        setCurrent(item);
        setLastDispatch(result?.lastDispatch || null);
        const local = localDateTimeParts(item?.scheduled_at);
        if (local) setForm(local);
        setLoadState({ status: "ready", error: null });
      })
      .catch((error) => { if (active) setLoadState({ status: "error", error }); });
    return () => { active = false; };
  }, [target]);

  return { loadState, current, setCurrent, lastDispatch, setLastDispatch, pushState, form, setForm };
};

const ReminderNotices = ({ current, activeLabel, dispatch, pushMessage, loadState, error }) => <>
  <div className="notice notice--info form-grid__full" role="status">
    <strong>{current ? "Pengingat aktif" : "Atur waktu sendiri"}</strong>
    <span>{current ? `Saat ini dijadwalkan ${activeLabel}.` : "Pengingat otomatis tetap berjalan. Pengingat ini menjadi tambahan khusus untuk Anda."}</span>
  </div>
  {dispatch ? <div className={`notice notice--${dispatch.tone} form-grid__full`} role={dispatch.tone === "danger" ? "alert" : "status"}>
    <strong>{dispatch.title}</strong>
    <span>{dispatch.message}</span>
  </div> : null}
  {pushMessage ? <div className="notice notice--warning form-grid__full" role="status">
    <strong>Periksa notifikasi perangkat</strong>
    <span>{pushMessage}</span>
  </div> : null}
  {loadState.status === "loading" ? <div className="notice notice--info form-grid__full">Memuat pengingat...</div> : null}
  {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message || "Pengingat tidak dapat diproses."}</div> : null}
</>;

const ReminderFields = ({ form, setForm, maxDate, minTime, busy, ready }) => <>
  <label className="field">
    <span>Tanggal *</span>
    <input required type="date" min={todayInJakarta()} max={maxDate} value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} disabled={busy || !ready} />
  </label>
  <label className="field">
    <span>Waktu *</span>
    <input required type="time" min={minTime} value={form.time} onChange={(event) => setForm((value) => ({ ...value, time: event.target.value }))} disabled={busy || !ready} />
  </label>
  <p className="field-hint form-grid__full">Zona waktu Asia/Jakarta. Scheduler memproses pengingat secara berkala, jadi notifikasi dapat muncul beberapa menit setelah waktu yang dipilih. Pengingat manual tidak menggantikan pengingat otomatis.</p>
</>;

const ManualReminderModal = ({ target, onClose }) => {
  const { notify } = useFeedback();
  const saveMutation = useGuardedMutation();
  const cancelMutation = useGuardedMutation();
  const state = useReminderLoader(target);
  const { loadState, current, setCurrent, lastDispatch, setLastDispatch, pushState, form, setForm } = state;
  const scheduledLocal = useMemo(() => `${form.date}T${form.time}`, [form.date, form.time]);
  const soon = localDateTimeParts(new Date(Date.now() + (5 * 60_000)));
  const busy = saveMutation.busy || cancelMutation.busy;
  const ready = loadState.status === "ready";
  const deliveryPending = Boolean(!current && lastDispatch && !["sent", "dead_letter"].includes(lastDispatch.status));
  const close = () => { if (!busy) onClose?.(); };

  const save = async (event) => {
    event.preventDefault();
    if (!target || !ready) return;
    try {
      const result = await saveMutation.run(() => saveManualReminder({ entityType: target.entityType, entityId: target.entityId, scheduledLocal, rowVersion: current?.row_version || null }));
      setCurrent(result.item);
      setLastDispatch(null);
      notify({ message: "Pengingat manual berhasil dijadwalkan.", tone: "success", dedupeKey: `reminder:${target.entityType}:${target.entityId}` });
    } catch { /* mutation state menampilkan error */ }
  };

  const cancel = async () => {
    if (!current) return;
    try {
      await cancelMutation.run(() => cancelManualReminder({ reminderId: current.reminder_id, rowVersion: current.row_version }));
      setCurrent(null);
      setLastDispatch(null);
      setForm(defaultForm(target));
      notify({ message: "Pengingat manual dibatalkan.", tone: "success", dedupeKey: `reminder-cancel:${target.entityType}:${target.entityId}` });
    } catch { /* mutation state menampilkan error */ }
  };

  const error = loadState.error || saveMutation.error || cancelMutation.error;
  const footer = <>
    {current ? <Button type="button" variant="danger" icon={FiTrash2} loading={cancelMutation.busy} disabled={busy || !ready} onClick={cancel}>Batalkan pengingat</Button> : null}
    <Button type="button" disabled={busy} onClick={close}>Tutup</Button>
    <Button type="submit" form="manual-reminder-form" variant="primary" icon={FiBell} loading={saveMutation.busy} disabled={busy || !ready || deliveryPending}>{current ? "Ubah jadwal" : "Simpan pengingat"}</Button>
  </>;

  return <Modal open={Boolean(target)} title="Pengingat manual" description={reminderDescription(target)} onClose={close} dismissible={!busy} mobileSwipeToClose size="sm" footer={footer}>
    <form id="manual-reminder-form" className="form-grid" onSubmit={save}>
      <ReminderNotices current={current} activeLabel={current?.scheduled_at ? formatDateTimeJakarta(current.scheduled_at) : ""} dispatch={dispatchNotice(lastDispatch)} pushMessage={pushAvailabilityMessage(pushState)} loadState={loadState} error={error} />
      <ReminderFields form={form} setForm={setForm} maxDate={addLocalDays(todayInJakarta(), 365)} minTime={soon?.date === form.date ? soon.time : undefined} busy={busy} ready={ready} />
    </form>
  </Modal>;
};

export default ManualReminderModal;
