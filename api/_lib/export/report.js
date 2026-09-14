const amount = (value) => Number(value || 0);

export const reportWorkbookSheets = (report, meta) => {
  const summary = report.reportSummary || {};
  const summaryRows = [
    { Metrik: "Periode", Nominal: "", Keterangan: meta.periodLabel },
    { Metrik: "Scope", Nominal: "", Keterangan: meta.scopeLabel },
  ];
  if (summary.mode === "allocation") {
    summaryRows.push(
      { Metrik: "Dana dialokasikan", Nominal: amount(summary.allocated), Keterangan: "" },
      { Metrik: "Terpakai", Nominal: amount(summary.used), Keterangan: "" },
      { Metrik: "Sisa", Nominal: amount(summary.remaining), Keterangan: "" },
      { Metrik: "Penggunaan", Nominal: "", Keterangan: `${Number(summary.usagePercent || 0)}%` },
    );
  } else {
    summaryRows.push(
      { Metrik: "Saldo awal", Nominal: amount(summary.openingBalance), Keterangan: "" },
      { Metrik: "Kredit", Nominal: amount(summary.credit), Keterangan: "" },
      { Metrik: "Debit", Nominal: amount(summary.debit), Keterangan: "" },
      { Metrik: "Saldo akhir", Nominal: amount(summary.closingBalance), Keterangan: "" },
    );
  }
  return {
    Ringkasan: summaryRows,
    Kewajiban: [
      { Metrik: "Pembayaran KPR/cicilan", Nominal: amount(report.commitmentActivity?.debt_payment_amount), Keterangan: "Arus kas keluar ke kewajiban" },
      { Metrik: "Pokok teridentifikasi", Nominal: amount(report.commitmentActivity?.identified_principal_amount), Keterangan: "Mengurangi sisa kewajiban" },
      { Metrik: "Bunga & biaya teridentifikasi", Nominal: amount(report.commitmentActivity?.identified_interest_amount), Keterangan: "Bagian biaya dari pembayaran" },
      { Metrik: "Pembayaran dengan pokok belum diperbarui", Nominal: amount(report.commitmentActivity?.unknown_principal_payment_amount), Keterangan: `${Number(report.commitmentActivity?.unknown_principal_payment_count || 0)} pembayaran` },
      { Metrik: "Setoran Arisan", Nominal: amount(report.commitmentActivity?.arisan_contribution_amount), Keterangan: "" },
      { Metrik: "Penerimaan Arisan", Nominal: amount(report.commitmentActivity?.arisan_receipt_amount), Keterangan: "" },
    ],
    Alokasi: (report.allocationOptions || []).map((item) => ({
      Alokasi: item.name,
      Dana_Alokasi: amount(item.allocated_amount),
      Terpakai: amount(item.used_amount),
      Sisa: amount(item.remaining_amount),
      Penggunaan_Persen: Number(item.usage_percent || 0),
    })),
    Kebutuhan: (report.budgets || []).map((item) => ({
      Kebutuhan: item.name,
      Alokasi: item.envelope_name || meta.scopeLabel,
      Rencana: amount(item.amount),
      Aktual: amount(item.used_amount),
      Sisa: amount(item.amount) - amount(item.used_amount),
      Status: item.status || "active",
    })),
    Transaksi: (report.reportTransactions || []).map((item) => ({
      Tanggal: item.transaction_date,
      Keterangan: item.description,
      Rekening: item.account_name,
      Alokasi: item.allocation_name || "-",
      Kebutuhan: item.budget_name || "-",
      Kategori: item.category_name || "-",
      Debit: amount(item.debit),
      Kredit: amount(item.credit),
      Saldo: amount(item.running_balance),
      Pencatat: item.creator_name || "-",
    })),
    Kategori: (report.categoryExpenses || []).map((item) => ({
      Kategori: item.label,
      Pengeluaran: amount(item.amount),
      Jumlah_Transaksi: Number(item.transaction_count || 0),
    })),
    Rekening: (report.accountExpenses || []).map((item) => ({
      Rekening: item.label,
      Pengeluaran: amount(item.amount),
      Jumlah_Transaksi: Number(item.transaction_count || 0),
    })),
  };
};
