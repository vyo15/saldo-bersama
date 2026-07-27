import { AuthProvider } from "../features/auth/AuthContext.jsx";
import { FinanceProvider } from "./FinanceContext.jsx";

const AppProviders = ({ children }) => (
  <AuthProvider>
    <FinanceProvider>{children}</FinanceProvider>
  </AuthProvider>
);

export default AppProviders;
