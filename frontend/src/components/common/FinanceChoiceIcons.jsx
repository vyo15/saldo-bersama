const IconBase = ({ children, ...props }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false" {...props}>
    {children}
  </svg>
);

export const MoneyInIcon = (props) => <IconBase {...props}><path d="M4.2 11.2h15.6v8H4.2z" /><path d="M6.4 13.1c.7 0 1.2-.5 1.2-1.2M16.4 11.9c0 .7.5 1.2 1.2 1.2M7.6 19.2c0-.7-.5-1.2-1.2-1.2M17.6 18c-.7 0-1.2.5-1.2 1.2" /><circle cx="12" cy="15.2" r="1.7" /><path d="M12 3.3v6" /><path d="m9.4 6.8 2.6 2.6 2.6-2.6" /></IconBase>;
export const MoneyOutIcon = (props) => <IconBase {...props}><path d="M4.2 11.2h15.6v8H4.2z" /><path d="M6.4 13.1c.7 0 1.2-.5 1.2-1.2M16.4 11.9c0 .7.5 1.2 1.2 1.2M7.6 19.2c0-.7-.5-1.2-1.2-1.2M17.6 18c-.7 0-1.2.5-1.2 1.2" /><circle cx="12" cy="15.2" r="1.7" /><path d="M12 9.4v-6" /><path d="m9.4 5.9 2.6-2.6 2.6 2.6" /></IconBase>;
export const TransferIcon = (props) => <IconBase {...props}><path d="M4 8h13" /><path d="m14 5 3 3-3 3" /><path d="M20 16H7" /><path d="m10 13-3 3 3 3" /></IconBase>;
export const RefundIcon = (props) => <IconBase {...props}><path d="M9 7H4V2" /><path d="M4.3 7.1A8.3 8.3 0 1 1 5.8 17" /><path d="M8.5 17.2h5.2" /></IconBase>;
export const BankTransferIcon = (props) => <IconBase {...props}><path d="M3.5 8.2 8.5 5l5 3.2H3.5Z" /><path d="M5 9.5v4M8.5 9.5v4M12 9.5v4M3.5 14.5h10" /><path d="M15.5 9h5" /><path d="m18.5 6.5 2 2.5-2 2.5" /><path d="M20.5 16h-5" /><path d="m17.5 13.5-2 2.5 2 2.5" /></IconBase>;
export const CashIcon = (props) => <IconBase {...props}><rect x="3.5" y="6.5" width="17" height="11" rx="2" /><circle cx="12" cy="12" r="2.4" /><path d="M6.2 9h.01M17.8 15h.01" /></IconBase>;
export const DebitCardIcon = (props) => <IconBase {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9.5h18M7 14h4" /></IconBase>;
export const EwalletIcon = (props) => <IconBase {...props}><path d="M4 7h14a2 2 0 0 1 2 2v9H6a3 3 0 0 1-3-3V8a4 4 0 0 1 4-4h10" /><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" /></IconBase>;
export const AutoDebitIcon = (props) => <IconBase {...props}><path d="M7 5h10l2 3-2 3" /><path d="M17 19H7l-2-3 2-3" /><path d="M5 8h11M19 16H8" /></IconBase>;
export const BankIcon = (props) => <IconBase {...props}><path d="M3 9h18L12 4 3 9Z" /><path d="M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18" /></IconBase>;
export const SavingsIcon = (props) => <IconBase {...props}><path d="M5 12c0-3.5 3-6 7-6 4.7 0 7 2.5 7 6 0 2.6-1.4 4.7-4 5.6V20h-3v-2H9.5L8 20H5.5l.7-3C5.4 15.8 5 14.1 5 12Z" /><path d="M15 9h.01M8 7 6 5" /><path d="M4 12H2" /></IconBase>;
export const EmergencyFundIcon = (props) => <IconBase {...props}><path d="M12 3 19 6v5c0 4.5-2.6 8-7 10-4.4-2-7-5.5-7-10V6l7-3Z" /><path d="M12 8v6M9 11h6" /></IconBase>;
export const SinkingFundIcon = (props) => <IconBase {...props}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M9 15h6M12 12v6" /></IconBase>;
export const InvestmentIcon = (props) => <IconBase {...props}><path d="M4 19V9M10 19V5M16 19v-8M22 19H2" /><path d="m4 8 6-4 6 5 5-5" /></IconBase>;
export const OtherIcon = (props) => <IconBase {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></IconBase>;
export const SharedIcon = (props) => <IconBase {...props}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.3" /><path d="M3 20a6 6 0 0 1 12 0M14 16a5 5 0 0 1 7 4" /></IconBase>;
export const PersonIcon = (props) => <IconBase {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></IconBase>;
export const AdminIcon = (props) => <IconBase {...props}><path d="M12 3 19 6v5c0 4.5-2.6 8-7 10-4.4-2-7-5.5-7-10V6l7-3Z" /><circle cx="12" cy="10" r="2" /><path d="M8.8 16a3.5 3.5 0 0 1 6.4 0" /></IconBase>;
export const DailyIcon = (props) => <IconBase {...props}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><circle cx="12" cy="15" r="2.3" /></IconBase>;
export const WeeklyIcon = (props) => <IconBase {...props}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7 3v4M17 3v4M3.5 10h17M8 14h8M8 17h5" /></IconBase>;
export const BiweeklyIcon = (props) => <IconBase {...props}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7 3v4M17 3v4M3.5 10h17" /><path d="M8 14h3M13 14h3M8 17h3M13 17h3" /></IconBase>;
export const MonthlyIcon = (props) => <IconBase {...props}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7 3v4M17 3v4M3.5 10h17" /><path d="M8 14h8M8 17h8" /></IconBase>;
export const PaycycleIcon = (props) => <IconBase {...props}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><circle cx="12" cy="15.5" r="2.6" /><path d="M12 13.8v3.4" /></IconBase>;
export const CustomPeriodIcon = (props) => <IconBase {...props}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M9 15h6M12 12v6" /></IconBase>;
export const ReturnRemainderIcon = (props) => <IconBase {...props}><path d="M5 7.5h9.5a4.5 4.5 0 0 1 0 9H9" /><path d="m8 4.5-3 3 3 3" /><path d="M15.5 12h3.5M17.25 10.25v3.5" /></IconBase>;
export const CarryForwardIcon = (props) => <IconBase {...props}><path d="M4.5 8h11" /><path d="m12.5 5 3 3-3 3" /><path d="M8.5 16h11" /><path d="m16.5 13 3 3-3 3" /><circle cx="6.5" cy="16" r="1.4" /></IconBase>;
export const TargetIcon = (props) => <IconBase {...props}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m15 9 5-5" /></IconBase>;
export const PriorityLowIcon = (props) => <IconBase {...props}><path d="M6 8 12 14 18 8" /><path d="M6 13 12 19 18 13" /></IconBase>;
export const PriorityNormalIcon = (props) => <IconBase {...props}><path d="M5 12h14" /><circle cx="12" cy="12" r="3" /></IconBase>;
export const PriorityHighIcon = (props) => <IconBase {...props}><path d="m6 16 6-6 6 6" /><path d="m6 11 6-6 6 6" /></IconBase>;
