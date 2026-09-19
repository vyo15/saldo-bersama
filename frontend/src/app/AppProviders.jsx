import { AuthProvider } from "../features/auth/AuthContext.jsx";
import { FinanceProvider } from "./FinanceContext.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";
import FeedbackProvider from "../components/feedback/FeedbackProvider.jsx";
import TransactionComposerProvider from "./TransactionComposerContext.jsx";
import QuickRecordProvider from "./QuickRecordContext.jsx";

const AppProviders = ({ children }) => (
  <ThemeProvider>
    <FeedbackProvider>
      <AuthProvider>
        <FinanceProvider>
          <TransactionComposerProvider><QuickRecordProvider>{children}</QuickRecordProvider></TransactionComposerProvider>
        </FinanceProvider>
      </AuthProvider>
    </FeedbackProvider>
  </ThemeProvider>
);

export default AppProviders;
