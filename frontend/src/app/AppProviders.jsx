import { AuthProvider } from "../features/auth/AuthContext.jsx";
import { FinanceProvider } from "./FinanceContext.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";
import FeedbackProvider from "../components/feedback/FeedbackProvider.jsx";
import TransactionComposerProvider from "./TransactionComposerContext.jsx";
import QuickRecordProvider from "./QuickRecordContext.jsx";
import { PrivacyProvider } from "./PrivacyContext.jsx";

const AppProviders = ({ children }) => (
  <ThemeProvider>
    <FeedbackProvider>
      <AuthProvider>
        <FinanceProvider>
          <PrivacyProvider><TransactionComposerProvider><QuickRecordProvider>{children}</QuickRecordProvider></TransactionComposerProvider></PrivacyProvider>
        </FinanceProvider>
      </AuthProvider>
    </FeedbackProvider>
  </ThemeProvider>
);

export default AppProviders;
