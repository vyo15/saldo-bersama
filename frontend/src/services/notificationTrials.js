export const NOTIFICATION_TRIAL_PRESETS = Object.freeze({
  vacation: Object.freeze({
    id: "vacation",
    label: "Liburan",
    title: "Liburan sebentar lagi! ❤️",
    body: "Target liburanmu makin dekat. Mau cek progress tabungan hari ini?",
    image: "/notifications/trial/liburan.png?v=1",
    targetPath: "/target",
    actionLabel: "Cek progress",
  }),
  future: Object.freeze({
    id: "future",
    label: "Masa depan",
    title: "Pelan-pelan, pasti bisa 💚",
    body: "Investasi, rumah, dan impian lainnya dibangun sedikit demi sedikit.",
    image: "/notifications/trial/masa-depan.png?v=1",
    targetPath: "/target",
    actionLabel: "Lihat target",
  }),
});

export const notificationTrialPreset = (theme) => NOTIFICATION_TRIAL_PRESETS[theme]
  || NOTIFICATION_TRIAL_PRESETS.vacation;
