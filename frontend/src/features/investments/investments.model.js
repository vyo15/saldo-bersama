const MUTUAL_FUND_TICKERS = new Set(["IHAJJ", "CAPFIX"]);

const isMutualFundInstrument = (instrument = {}) => {
  const ticker = String(instrument.ticker || "").trim().toUpperCase();
  return instrument.asset_type === "mutual_fund"
    || String(instrument.exchange || "").trim().toUpperCase() === "REKSADANA"
    || MUTUAL_FUND_TICKERS.has(ticker);
};

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


const investmentQuantityError = (value, instrument, label) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return `${label} harus lebih dari 0.`;
  if (isMutualFundInstrument(instrument || {})) {
    if (!Number.isSafeInteger(quantity)) return `${label} harus berupa bilangan bulat.`;
    return "";
  }
  const lotSize = Number(instrument?.lot_size || 100);
  const shares = quantity * lotSize;
  if (!Number.isSafeInteger(shares)) return `${label} harus sesuai kelipatan minimum 1 saham (${(1 / lotSize).toLocaleString("id-ID", { maximumFractionDigits: 6 })} lot).`;
  return "";
};

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
  if (mode === "opening_position") return instruments.filter((item) => item.status === "active" && !heldIds.has(item.instrument_id));
  return instruments;
};

export const investmentTradePreview = (mode, form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || 100);
  const lots = Number(form.lots || 0);
  const pricePerShare = Number(form.price_per_share || 0);
  const feeAmount = 0;
  const shares = lots * lotSize;
  const grossAmount = shares * pricePerShare;
  const rdnAmount = mode === "sell" ? grossAmount - feeAmount : grossAmount + feeAmount;
  return { instrument, lotSize, lots, shares, pricePerShare, feeAmount, grossAmount, rdnAmount };
};

export const investmentProjectedAverage = (form = {}, instruments = [], portfolio = {}) => {
  const preview = investmentTradePreview("buy", form, instruments);
  const holding = (portfolio?.holdings || []).find((item) => item.instrument_id === preview.instrument?.instrument_id) || null;
  const currentShares = Number(holding?.shares || 0);
  const currentCostBasis = Number(holding?.cost_basis || 0);
  const currentAverage = currentShares > 0 ? Math.round(currentCostBasis / currentShares) : 0;
  const nextShares = currentShares + Number(preview.shares || 0);
  const nextCostBasis = currentCostBasis + Number(preview.grossAmount || 0);
  const nextAverage = nextShares > 0 ? Math.round(nextCostBasis / nextShares) : 0;
  return { currentAverage, nextAverage, currentShares, nextShares, holding, ...preview };
};


const safeIntegerProduct = (left, right) => {
  const product = Number(left) * Number(right);
  return Number.isSafeInteger(left) && Number.isSafeInteger(right) && Number.isSafeInteger(product) ? product : 0;
};

export const investmentOpeningPositionPreview = (form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const mutualFund = isMutualFundInstrument(instrument || {});
  const quantity = Number(form.opening_quantity || 0);
  const lotSize = Number(instrument?.lot_size || (mutualFund ? 1 : 100));
  const shares = mutualFund ? quantity : quantity * lotSize;
  const averagePrice = Number(form.average_price || 0);
  const currentPrice = Number(form.reference_price || 0);
  const costBasis = safeIntegerProduct(shares, averagePrice);
  const marketValue = safeIntegerProduct(shares, currentPrice);
  const unrealizedPl = marketValue - costBasis;
  const returnPercent = costBasis > 0 ? (unrealizedPl / costBasis) * 100 : null;
  return { instrument, mutualFund, quantity, lotSize, shares, averagePrice, currentPrice, costBasis, marketValue, unrealizedPl, returnPercent };
};


export const investmentOwnershipLabel = (portfolio = {}) => {
  if (portfolio.owner_scope !== "personal") return "Bersama";
  return portfolio.is_owned_by_actor ? "Pribadi" : "Pasangan";
};

export const investmentPriceSourceLabel = (holding = {}) => holding.price_source === "valuation"
  ? "Harga manual terakhir"
  : holding.price_source === "trade"
    ? "Harga transaksi terakhir"
    : holding.price_source === "opening_position"
      ? "Harga referensi posisi awal"
      : "Harga terakhir dicatat";

export const investmentProfitLossLabel = (value) => Number(value || 0) > 0
  ? "Untung"
  : Number(value || 0) < 0
    ? "Rugi"
    : "Impas";

export const investmentActivityForInstrument = (activity = [], instrumentId = "") => activity
  .filter((item) => item.instrument_id === instrumentId)
  .slice(0, 20);

export const investmentActivityLabel = (activity = {}) => {
  const ticker = activity.ticker || "saham";
  if (activity.activity_type === "trade") return `${activity.trade_type === "buy" ? "Pembelian dicatat" : "Penjualan dicatat"} · ${ticker}`;
  if (activity.activity_type === "valuation") return `${activity.asset_type === "mutual_fund" ? "Nilai manual diperbarui" : "Harga manual diperbarui"} · ${ticker}`;
  if (activity.activity_type === "opening_position") return activity.instrument_id ? `Posisi awal dicatat · ${ticker}` : "Saldo awal RDN dicatat";
  return `Koreksi dicatat · ${activity.instrument_id ? ticker : "Saldo RDN"}`;
};

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

const tradeInstrumentLabels = (instrument) => isMutualFundInstrument(instrument || {})
  ? { quantity: "Unit", price: "Nilai per unit", availability: "unit" }
  : { quantity: "Lot", price: "Harga per saham", availability: "lot" };

const availableTradeQuantity = (instrument, holding) => {
  if (isMutualFundInstrument(instrument || {})) return Number(holding?.shares || 0);
  const lotSize = Number(instrument?.lot_size || holding?.lot_size || 100);
  return Math.floor(Number(holding?.shares || 0) / lotSize);
};

const validateTrade = (mode, form, context) => {
  const { instruments, portfolio, today } = context;
  const errors = {};
  const instrument = instrumentForMode(mode, form, instruments, portfolio);
  const labels = tradeInstrumentLabels(instrument);
  if (!instrument) errors.instrument_id = "Pilih aset yang tersedia.";

  const lotsError = positiveIntegerError(form.lots, labels.quantity);
  const priceError = positiveIntegerError(form.price_per_share, labels.price);
  const dateError = requiredDateError(form.trade_date, "Tanggal transaksi", today);
  if (lotsError) errors.lots = lotsError;
  if (priceError) errors.price_per_share = priceError;
  if (dateError) errors.trade_date = dateError;
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";

  if (mode !== "sell" || !instrument || lotsError) return errors;
  const holding = (portfolio?.holdings || []).find((item) => item.instrument_id === instrument.instrument_id);
  const availableQuantity = availableTradeQuantity(instrument, holding);
  if (Number(form.lots) > availableQuantity) {
    errors.lots = `Maksimal ${availableQuantity.toLocaleString("id-ID")} ${labels.availability} sesuai kepemilikan saat ini.`;
  }
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

const reconcileQuantityError = ({ form, item, holdings }) => {
  const key = `quantity:${item.instrument_id}`;
  const holding = holdings.find((candidate) => candidate.instrument_id === item.instrument_id);
  const lotSize = Number(item.lot_size || holding?.lot_size || 100);
  const mutualFund = isMutualFundInstrument(item);
  const holdingShares = Number(holding?.shares || 0);
  const fallback = mutualFund ? holdingShares : holdingShares / lotSize;
  const quantity = Number(form[key] ?? fallback);
  const shares = mutualFund ? quantity : quantity * lotSize;
  const valid = Number.isFinite(quantity) && quantity >= 0 && Number.isSafeInteger(shares);
  return valid ? null : [key, `${item.ticker || item.name} · ${mutualFund ? "unit" : "lot"} aktual tidak valid.`];
};

const validateReconcile = (form, context) => {
  const { instruments, portfolio, today } = context;
  const errors = {};
  const cashError = nonNegativeIntegerError(form.actual_cash, "Saldo RDN aktual");
  const dateError = requiredDateError(form.reconciliation_date, "Tanggal pencocokan", today);
  if (cashError) errors.actual_cash = cashError;
  if (dateError) errors.reconciliation_date = dateError;

  const holdings = portfolio?.holdings || [];
  for (const item of selectInvestmentInstruments(instruments, holdings, "reconcile")) {
    const quantityError = reconcileQuantityError({ form, item, holdings });
    if (quantityError) errors[quantityError[0]] = quantityError[1];
  }
  return errors;
};

const correctionIntegerErrors = (form, instruments) => {
  const errors = {};
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const quantity = Number(form.quantity_delta || 0);
  const lotSize = Number(instrument?.lot_size || 100);
  const shares = isMutualFundInstrument(instrument || {}) ? quantity : quantity * lotSize;
  const shareError = !Number.isFinite(quantity) || !Number.isSafeInteger(shares) ? "Delta lot/unit tidak valid." : "";
  const costError = signedIntegerError(form.cost_basis_delta || 0, "Delta cost basis");
  const cashError = signedIntegerError(form.cash_delta || 0, "Delta saldo RDN");
  if (shareError) errors.quantity_delta = shareError;
  if (costError) errors.cost_basis_delta = costError;
  if (cashError) errors.cash_delta = cashError;
  return errors;
};

const validateCorrectionHolding = (form, instruments, errors) => {
  const shareDelta = Number(form.quantity_delta || 0);
  const costDelta = Number(form.cost_basis_delta || 0);
  const cashDelta = Number(form.cash_delta || 0);
  if (!shareDelta && !costDelta && !cashDelta) errors._form = "Koreksi harus mengubah lot/unit, cost basis, atau saldo RDN.";

  if (!shareDelta && !costDelta) {
    if (form.instrument_id) errors.instrument_id = "Kosongkan saham bila koreksi hanya mengubah saldo RDN.";
    return;
  }

  if (!shareDelta || !costDelta || Math.sign(shareDelta) !== Math.sign(costDelta)) {
    errors.quantity_delta = "Delta lot/unit dan cost basis harus sama-sama diisi dan searah.";
    errors.cost_basis_delta = "Delta lot/unit dan cost basis harus sama-sama diisi dan searah.";
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

  const integerErrors = correctionIntegerErrors(form, instruments);
  Object.assign(errors, integerErrors);
  if (Object.keys(integerErrors).length) return errors;

  validateCorrectionHolding(form, instruments, errors);
  return errors;
};

const openingPositionOverflowErrors = (form, instruments, { quantityError, averageError, priceError }) => {
  if (quantityError || (averageError && priceError)) return {};
  const preview = investmentOpeningPositionPreview(form, instruments);
  const errors = {};
  if (!averageError && preview.costBasis <= 0) errors.average_price = "Total modal hasil perhitungan melampaui batas nominal aman.";
  if (!priceError && preview.marketValue <= 0) errors.reference_price = "Nilai sekarang hasil perhitungan melampaui batas nominal aman.";
  return errors;
};

const openingPositionCashError = (form, portfolio, cashOnly) => {
  const cashMissing = form.actual_cash === "" || form.actual_cash === undefined || form.actual_cash === null;
  if (cashMissing) return cashOnly ? "Saldo RDN awal wajib diisi." : "";

  const cashError = nonNegativeIntegerError(form.actual_cash, "Saldo RDN awal");
  if (cashError) return cashError;
  if (cashOnly && Number(form.actual_cash) === Number(portfolio?.rdn_cash || 0)) {
    return "Saldo RDN awal sudah sama dengan saldo tercatat; tidak ada baseline baru untuk disimpan.";
  }
  return "";
};

const openingPositionAssetErrors = (form, context) => {
  const errors = {};
  const instrument = instrumentForMode("opening_position", form, context.instruments, context.portfolio);
  if (!instrument) errors.instrument_id = "Pilih aset untuk kondisi awal.";

  const quantityError = investmentQuantityError(
    form.opening_quantity,
    instrument || {},
    isMutualFundInstrument(instrument || {}) ? "Jumlah unit" : "Jumlah lot",
  );
  const averageError = positiveIntegerError(form.average_price, "Harga rata-rata beli");
  const priceError = positiveIntegerError(form.reference_price, "Harga sekarang");
  if (quantityError) errors.opening_quantity = quantityError;
  if (averageError) errors.average_price = averageError;
  if (priceError) errors.reference_price = priceError;
  return Object.assign(errors, openingPositionOverflowErrors(form, context.instruments, { quantityError, averageError, priceError }));
};

const validateOpeningPosition = (form, context) => {
  const errors = {};
  const cashOnly = Boolean(form.opening_cash_only);
  const dateError = requiredDateError(form.position_date, "Tanggal kondisi awal", context.today);
  if (dateError) errors.position_date = dateError;

  const cashError = openingPositionCashError(form, context.portfolio, cashOnly);
  if (cashError) errors.actual_cash = cashError;
  if (!cashOnly) Object.assign(errors, openingPositionAssetErrors(form, context));
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";
  return errors;
};

const operationValidators = {
  buy: (form, context) => validateTrade("buy", form, context),
  sell: (form, context) => validateTrade("sell", form, context),
  price: validatePrice,
  reconcile: validateReconcile,
  correction: validateCorrection,
  opening_position: validateOpeningPosition,
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

const assetPositionFieldErrors = (form, instrument, today) => {
  const errors = {};
  const mutualFund = isMutualFundInstrument(instrument || {});
  const quantityError = investmentQuantityError(form.opening_quantity, instrument || {}, mutualFund ? "Jumlah unit" : "Jumlah lot");
  const averageError = positiveIntegerError(form.average_price, mutualFund ? "Nilai rata-rata per unit" : "Harga rata-rata per saham");
  const referenceError = positiveIntegerError(form.reference_price, mutualFund ? "Nilai per unit saat ini" : "Harga saham saat ini");
  const dateError = requiredDateError(form.position_date, "Tanggal posisi", today);
  if (!instrument || !String(form.ticker || instrument?.ticker || "").trim()) errors.ticker = "Pilih saham atau reksa dana yang ingin dicatat.";
  if (quantityError) errors.opening_quantity = quantityError;
  if (averageError) errors.average_price = averageError;
  if (referenceError) errors.reference_price = referenceError;
  if (dateError) errors.position_date = dateError;
  if (String(form.notes || "").length > 500) errors.notes = "Catatan maksimal 500 karakter.";
  return errors;
};

const assetPositionOverflow = (form, instrument, errors) => {
  if (!instrument || errors.opening_quantity || errors.average_price || errors.reference_price) return false;
  const quantity = Number(form.opening_quantity);
  const shares = isMutualFundInstrument(instrument) ? quantity : quantity * Number(instrument.lot_size || 100);
  const costBasis = shares * Number(form.average_price);
  const marketValue = shares * Number(form.reference_price);
  return !Number.isSafeInteger(shares) || !Number.isSafeInteger(costBasis) || !Number.isSafeInteger(marketValue);
};

export const validateInvestmentAssetPosition = (form = {}, instrument = null, options = {}) => {
  const errors = assetPositionFieldErrors(form, instrument, options.today || todayJakarta());
  if (assetPositionOverflow(form, instrument, errors)) errors._form = "Jumlah atau nilai investasi terlalu besar untuk disimpan dengan aman.";
  return errors;
};
