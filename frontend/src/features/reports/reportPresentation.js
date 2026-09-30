const toAmount = (value) => Number(value || 0);

export const buildAllocationHealthModel = (items = []) => {
  const counts = items.reduce((result, item) => {
    const allocated = toAmount(item.allocated_amount);
    const used = toAmount(item.used_amount);
    const remaining = toAmount(item.remaining_amount);

    if (remaining < 0 || used > allocated) result.over += 1;
    else if (allocated > 0 && used / allocated >= 0.8) result.attention += 1;
    else result.safe += 1;
    return result;
  }, { safe: 0, attention: 0, over: 0 });

  const total = items.length;
  const reviewCount = counts.attention + counts.over;
  const summary = reviewCount
    ? `${reviewCount} Alokasi perlu ditinjau`
    : "Semua Alokasi masih aman";

  const segments = [
    { key: "safe", label: "aman", count: counts.safe, tone: "safe" },
    { key: "attention", label: "perhatian", count: counts.attention, tone: "warning" },
    { key: "over", label: "melewati", count: counts.over, tone: "danger" },
  ].map((segment) => ({
    ...segment,
    percent: total ? (segment.count / total) * 100 : 0,
  }));

  return {
    total,
    counts,
    reviewCount,
    summary,
    summaryTone: reviewCount ? "warning" : "safe",
    segments,
    ariaLabel: total
      ? `Kondisi Alokasi: ${counts.safe} aman, ${counts.attention} perhatian, ${counts.over} melewati. ${summary}.`
      : "Belum ada Alokasi aktif pada periode ini.",
  };
};
