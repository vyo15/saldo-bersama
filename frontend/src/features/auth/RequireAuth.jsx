import { Navigate, Outlet, useLocation } from "react-router";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useNetworkStatus } from "../../hooks/useNetworkStatus.js";
import { useAuth } from "./AuthContext.jsx";
import SessionGateState from "./SessionGateState.jsx";

const RequireAuth = () => {
  const { status, refreshSession } = useAuth();
  const { offline } = useNetworkStatus();
  const location = useLocation();
  if (status === "loading") return <LoadingScreen label="Memeriksa sesi aman..." />;
  if (status === "error") return <SessionGateState offline={offline} onRetry={refreshSession} />;
  if (status !== "authenticated") return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  return <Outlet />;
};

export default RequireAuth;
