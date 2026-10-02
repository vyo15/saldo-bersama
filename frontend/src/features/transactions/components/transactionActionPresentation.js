export const canRepeatTransaction = (item) => item.status === "active" && ["expense", "income", "transfer"].includes(item.transaction_type);

export const managedTransactionModule = (item) => ({ recurring: "Jadwal rutin", goal: "Target" }[item.managed_by] || "");
