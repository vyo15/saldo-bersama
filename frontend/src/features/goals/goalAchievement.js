const MILESTONES = Object.freeze([25, 50, 75, 90]);
const TRAVEL_PATTERN = /\b(liburan|wisata|travel|trip|bali|mudik|honeymoon|jalan[- ]?jalan)\b/i;

const clampedProgress = (currentAmount, targetAmount) => {
  if (!(targetAmount > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((currentAmount / targetAmount) * 100)));
};

const crossedMilestone = (beforeAmount, afterAmount, targetAmount) => MILESTONES
  .filter((milestone) => beforeAmount * 100 < targetAmount * milestone && afterAmount * 100 >= targetAmount * milestone)
  .at(-1) || null;

const generalDepositCopy = (goal) => {
  const goalName = String(goal.name || "Target");
  if (goal.goal_type === "emergency_fund") return {
    title: `${goalName} makin kuat 🛡️`,
    message: "Sedikit demi sedikit, ruang aman keuangan bertambah.",
  };
  if (goal.goal_type === "sinking_fund") return {
    title: `${goalName} makin siap 🌱`,
    message: "Setoran hari ini membuat kebutuhan berikutnya terasa lebih ringan.",
  };
  if (TRAVEL_PATTERN.test(goalName)) return {
    title: `${goalName} makin dekat ❤️`,
    message: "Pelan-pelan, rencana ini makin nyata.",
  };
  return {
    title: `${goalName} makin dekat 💚`,
    message: "Langkah kecil hari ini ikut membangun rencana besar nanti.",
  };
};

const milestoneCopy = (milestone) => {
  if (milestone === 25) return { title: "Langkah pertamanya mulai terlihat ✨", message: "Seperempat jalan sudah lewat. Ritmenya mulai terbentuk." };
  if (milestone === 50) return { title: "Separuh jalan sudah lewat ✨", message: "Bukan cuma angka. Rencana ini benar-benar bergerak." };
  if (milestone === 75) return { title: "Tiga perempat jalan sudah lewat 💚", message: "Sudah jauh berjalan. Tinggal menjaga ritmenya." };
  return { title: "Tinggal sedikit lagi 👀", message: "Target sudah sangat dekat. Pelan-pelan sampai selesai." };
};

const completionCopy = (goal) => goal.goal_type === "emergency_fund"
  ? { title: "Dana darurat sudah penuh 🛡️", message: "Ruang aman yang dibangun sekarang sudah mencapai target." }
  : { title: "Target penuh 🎉", message: "Yang dulu cuma rencana, sekarang sudah siap diwujudkan." };

const achievementArt = (goal) => TRAVEL_PATTERN.test(String(goal.name || ""))
  ? "/notifications/trial/liburan.webp?v=2"
  : "/notifications/trial/masa-depan.webp?v=2";

export const goalAchievementPresentation = ({ goalBefore, goalAfter, amount }) => {
  const targetAmount = Number(goalAfter?.target_amount ?? goalBefore?.target_amount ?? 0);
  const afterAmount = Math.max(0, Number(goalAfter?.current_amount || 0));
  const depositedAmount = Number(amount || 0);
  if (!(targetAmount > 0) || !(depositedAmount > 0) || afterAmount < depositedAmount) return null;
  const beforeAmount = Math.max(0, afterAmount - depositedAmount);

  const goal = { ...(goalBefore || {}), ...(goalAfter || {}) };
  const progressPercent = clampedProgress(afterAmount, targetAmount);
  const remainingAmount = Math.max(0, targetAmount - afterAmount);
  const milestone = crossedMilestone(beforeAmount, afterAmount, targetAmount);
  const isComplete = afterAmount >= targetAmount;
  const copy = isComplete ? completionCopy(goal) : milestone ? milestoneCopy(milestone) : generalDepositCopy(goal);

  return Object.freeze({
    kind: isComplete ? "reached" : milestone ? "milestone" : "deposit",
    art: achievementArt(goal),
    kicker: isComplete ? "🎉 100% terkumpul" : milestone ? `✨ Milestone ${milestone}%` : "🌱 Setoran tercatat",
    title: copy.title,
    message: copy.message,
    goalName: String(goal.name || "Target"),
    amount: depositedAmount,
    currentAmount: afterAmount,
    targetAmount,
    remainingAmount,
    progressPercent,
    milestone,
  });
};
