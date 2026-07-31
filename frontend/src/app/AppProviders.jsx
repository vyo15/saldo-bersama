import { AuthProvider } from "../features/auth/AuthContext.jsx";
import { FinanceProvider } from "./FinanceContext.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";

const AppProviders = ({ children }) => (
  <ThemeProvider>
    <AuthProvider>
      <FinanceProvider>{children}</FinanceProvider>
    </AuthProvider>
  </ThemeProvider>
);

export default AppProviders;
