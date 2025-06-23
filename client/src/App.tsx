import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PipelinesDashboardPage } from "./pages/PipelinesDashboardPage";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { GroupManagementPage } from "./pages/GroupManagementPage";
import { BulkReleasePage } from "./pages/BulkReleasePage";
import { BulkDeployPage } from "./pages/BulkDeployPage";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pipelines"
        element={
          <ProtectedRoute>
            <PipelinesDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <ProjectDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group-management"
        element={
          <ProtectedRoute>
            <GroupManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bulk-release"
        element={
          <ProtectedRoute>
            <BulkReleasePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bulk-deploy"
        element={
          <ProtectedRoute>
            <BulkDeployPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
};

export default App;
