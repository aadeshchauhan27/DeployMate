import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gitlab, BarChart3, Plus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export const AppHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 mb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <Gitlab className="w-8 h-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">
                DeployMate
              </span>
            </Link>
            <Link to="/dashboard" className="btn-secondary text-sm">
              Dashboard
            </Link>
            <Link
              to="/groups"
              className="btn-secondary text-sm flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Groups</span>
            </Link>
            <Link
              to="/pipelines"
              className="btn-secondary text-sm flex items-center space-x-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Pipelines</span>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>Welcome,</span>
              <span className="font-medium text-gray-900">
                {user?.username}
              </span>
            </div>
            <button onClick={logout} className="btn-secondary text-sm">
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
