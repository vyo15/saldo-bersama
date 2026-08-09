import { AuthProvider } from "../features/auth/AuthContext.jsx";
import { FinanceProvider } from "./FinanceContext.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";
import FeedbackProvider from "../components/feedback/FeedbackProvider.jsx";
import TransactionComposerProvider from "./TransactionComposerContext.jsx";

const AppProviders = ({ children }) => (
  <ThemeProvider>
    <FeedbackProvider>
      <AuthProvider>
        <FinanceProvider>
          <TransactionComposerProvider>{children}</TransactionComposerProvider>
        </FinanceProvider>
      </AuthProvider>
    </FeedbackProvider>
  </ThemeProvider>
);

export default AppProviders;
