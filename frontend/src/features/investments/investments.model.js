const finiteInteger = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

const positiveIntegerError = (value, label) => {
  const number = finiteInteger(value);
  if (number == null || number <= 0) return `${label} harus berupa bilangan bulat lebih dari 0.`;
  return "";
};

const nonNegativeIntegerError = (value, label) => {
  const number = finiteInteger(value);
  if (number == null || number < 0) return `${label} harus berupa bilangan bulat 0 atau lebih.`;
  return "";
};

const signedIntegerError = (value, label) => {
  if (finiteInteger(value) == null) return `${label} harus berupa bilangan bulat.`;
  return "";
};

const todayJakarta = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const requiredDateError = (value, label, today = todayJakarta()) => {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${label} wajib dipilih.`;
  if (date > today) return `${label} tidak boleh di masa depan.`;
  return "";
};

export const selectInvestmentInstruments = (instruments = [], holdings = [], mode = "buy") => {
  const holdingsById = new Map(holdings.map((item) => [item.instrument_id, item]));
  const heldIds = new Set(holdingsById.keys());
  if (mode === "buy") return instruments.filter((item) => item.status === "active");
  if (mode === "sell") return instruments.filter((item) => {
    const holding = holdingsById.get(item.instrument_id);
    const lotSize = Number(item.lot_size || holding?.lot_size || 100);
    return holding && Number(holding.shares || 0) >= lotSize;
  });
  if (mode === "price") return instruments.filter((item) => heldIds.has(item.instrument_id));
  if (mode === "reconcile") return instruments.filter((item) => item.status === "active" || heldIds.has(item.instrument_id));
  return instruments;
};

export const investmentTradePreview = (mode, form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || 100);
  const lots = Number(form.lots || 0);
  const pricePerShare = Number(form.price_per_share || 0);
  const feeAmount = Number(form.fee_amount || 0);
  const shares = lots * lotSize;
  const grossAmount = shares * pricePerShare;
  const rdnAmount = mode === "sell" ? grossAmount - feeAmount : grossAmount + feeAmount;
  return { instrument, lotSize, lots, shares, pricePerShare, feeAmount, grossAmount, rdnAmount };
};


export const investmentOwnershipLabel = (portfolio = {}) => {
  if (portfolio.owner_scope !== "personal") return "Bersama";
  return portfolio.is_owned_by_actor ? "Pribadi" : "Pasangan";
};

export const investmentPriceSourceLabel = (holding = {}) => holding.price_source === "valuation"
  ? "Harga manual terakhir"
  : holding.price_source === "trade"
    ? "Harga transaksi terakhir"
    : "Harga terakhir dicatat";

export const investmentProfitLossLabel = (value) => Number(value || 0) > 0
  ? "Untung"
  : Number(value || 0) < 0
    ? "Rugi"
    : "Impas";

export const investmentActivityForInstrument = (activity = [], instrumentId = "") => activity
  .filter((item) => item.instrument_id === instrumentId)
  .slice(0, 20);

export const investmentReturnPercent = (profitLoss, costBasis) => {
  const profit = Number(profitLoss || 0);
  const basis = Number(costBasis || 0);
  if (!Number.isFinite(profit) || !Number.isFinite(basis) || basis <= 0) return null;
  return (profit / basis) * 100;
};

const instrumentForMode = (mode, form, instruments, portfolio) => {
  const selectionMode = mode === "price" ? "price" : mode;
  const options = selectInvestmentInstruments(instruments, portfolio?.holdings || [], selectionMode);
  return options.find((item) => item.instrument_id === form.instrument_id) || null;
};

const validateTrade = (mode, form, context) => {
  const { instruments, portfolio, today } = context;
  const errors = {};
  const instrument = instrumentForMode(mode, form, instruments, portfolio);
  if (!instrument) errors.instrument_id = "Pilih saham yang tersedia.";

  const lotsError = positiveIntegerError(form.lots, "Lot");
  const priceError = positiveIntegerError(form.price_per_share, "Harga per saham");
  const feeError = nonNegativeIntegerError(form.fee_amount || 0, "Fee");
  const dateError = requiredDateError(form.trade_date, "Tanggal transaksi", today);
  if (lotsError) errors.lots = lotsError;
  if (priceError) errors.price_per_share = priceError;
  if (feeError) errors.fee_amount = feeError;
  if (dateError) errors.trade_date = dateError;

  if (mode !== "sell" || !instrument || lotsError) return errors;
  const holding = (portfolio?.holdings || []).find((item) => item.instrument_id === instrument.instrument_id);
  const lotSize = Number(instrument.lot_size || holding?.lot_size || 100);
  const availableLots = Math.floor(Number(holding?.shares || 0) / lotSize);
  if (Number(form.lots) > availableLots) errors.lots = `Maksimal ${availableLots.toLocaleString("id-ID")} lot sesuai holding saat ini.`;
  return errors;
};

const validatePrice = (form, context) => {
  const errors = {};
  if (!instrumentForMode("price", form, context.instruments, context.portfolio)) errors.instrument_id = "Pilih saham yang tersedia.";
  const priceError = positiveIntegerError(form.price_per_share, "Harga per saham");
  const dateError = requiredDateError(form.valuation_date, "Tanggal harga", context.today);
  if (priceError) errors.price_per_share = priceError;
  if (dateError) errors.valuation_date = dateError;
  return errors;
};

const validateReconcile = (form, context) => {
  const { instruments, portfolio, today } = context;
  const errors = {};
  const cashError = nonNegativeIntegerError(form.actual_cash, "Cash RDN aktual");
  const dateError = requiredDateError(form.reconciliation_date, "Tanggal pencocokan", today);
  if (cashError) errors.actual_cash = cashError;
  if (dateError) errors.reconciliation_date = dateError;

  const holdings = portfolio?.holdings || [];
  for (const item of selectInvestmentInstruments(instruments, holdings, "reconcile")) {
    const key = `shares:${item.instrument_id}`;
    const fallback = holdings.find((holding) => holding.instrument_id === item.instrument_id)?.shares || 0;
    const sharesError = nonNegativeIntegerError(form[key] ?? fallback, `${item.ticker} · lembar aktual`);
    if (sharesError) errors[key] = sharesError;
  }
  return errors;
};

const correctionIntegerErrors = (form) => {
  const errors = {};
  const shareError = signedIntegerError(form.share_delta || 0, "Delta lembar");
  const costError = signedIntegerError(form.cost_basis_delta || 0, "Delta cost basis");
  const cashError = signedIntegerError(form.cash_delta || 0, "Delta cash RDN");
  if (shareError) errors.share_delta = shareError;
  if (costError) errors.cost_basis_delta = costError;
  if (cashError) errors.cash_delta = cashError;
  return errors;
};

const validateCorrectionHolding = (form, instruments, errors) => {
  const shareDelta = Number(form.share_delta || 0);
  const costDelta = Number(form.cost_basis_delta || 0);
  const cashDelta = Number(form.cash_delta || 0);
  if (!shareDelta && !costDelta && !cashDelta) errors._form = "Koreksi harus mengubah lembar, cost basis, atau cash RDN.";

  if (!shareDelta && !costDelta) {
    if (form.instrument_id) errors.instrument_id = "Kosongkan saham bila koreksi hanya mengubah cash RDN.";
    return;
  }

  if (!shareDelta || !costDelta || Math.sign(shareDelta) !== Math.sign(costDelta)) {
    errors.share_delta = "Delta lembar dan cost basis harus sama-sama diisi dan searah.";
    errors.cost_basis_delta = "Delta lembar dan cost basis harus sama-sama diisi dan searah.";
  }
  if (!instruments.some((item) => item.instrument_id === form.instrument_id)) errors.instrument_id = "Pilih saham untuk koreksi kepemilikan.";
};

const validateCorrection = (form, context) => {
  const { instruments, userRole, today } = context;
  const errors = {};
  if (userRole !== "owner") return { _form: "Koreksi investasi hanya tersedia untuk Administrator." };

  const dateError = requiredDateError(form.correction_date, "Tanggal koreksi", today);
  if (dateError) errors.correction_date = dateError;
  if (String(form.reason || "").trim().length < 5) errors.reason = "Alasan koreksi minimal 5 karakter.";

  const integerErrors = correctionIntegerErrors(form);
  Object.assign(errors, integerErrors);
  if (Object.keys(integerErrors).length) return errors;

  validateCorrectionHolding(form, instruments, errors);
  return errors;
};

const operationValidators = {
  buy: (form, context) => validateTrade("buy", form, context),
  sell: (form, context) => validateTrade("sell", form, context),
  price: validatePrice,
  reconcile: validateReconcile,
  correction: validateCorrection,
};

export const validateInvestmentOperation = (mode, form = {}, options = {}) => {
  const context = {
    instruments: options.instruments || [],
    portfolio: options.portfolio || null,
    userRole: options.userRole || "",
    today: options.today || todayJakarta(),
  };
  return operationValidators[mode]?.(form, context) || {};
};

export const validateInvestmentSetup = (kind, form = {}, accounts = []) => {
  const errors = {};
  if (kind === "portfolio") {
    if (String(form.source_label || "").trim().length > 100) errors.source_label = "Sumber catatan maksimal 100 karakter.";
    if (!accounts.some((item) => item.account_id === form.rdn_account_id)) errors.rdn_account_id = accounts.length ? "Pilih rekening RDN yang tersedia." : "Buat rekening jenis Investasi terlebih dahulu.";
    return errors;
  }

  const ticker = String(form.ticker || "").trim().toUpperCase();
  const exchange = String(form.exchange || "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,16}$/.test(ticker)) errors.ticker = "Ticker hanya boleh berisi huruf besar, angka, titik, atau tanda hubung.";
  if (!/^[A-Z0-9.-]{2,16}$/.test(exchange)) errors.exchange = "Kode bursa harus 2–16 karakter yang valid.";
  if (!String(form.instrument_name || "").trim()) errors.instrument_name = "Nama saham wajib diisi.";
  const lotError = positiveIntegerError(form.lot_size, "Lembar per lot");
  if (lotError) errors.lot_size = lotError;
  return errors;
};
