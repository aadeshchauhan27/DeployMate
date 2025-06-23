import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Gitlab, BarChart3, Plus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: null,
  },
  {
    to: "/group-management",
    label: "Group Management",
    icon: <Plus className="w-4 h-4" />,
  },
  {
    to: "/bulk-release",
    label: "Bulk Release",
    icon: null,
  },
  {
    to: "/bulk-deploy",
    label: "Bulk Deploy",
    icon: null,
  },
  {
    to: "/pipelines",
    label: "Pipelines",
    icon: <BarChart3 className="w-4 h-4" />,
  },
];

export const AppHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 mb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="flex items-center space-x-2 group">
              <Gitlab className="w-8 h-8 text-primary-600 group-hover:scale-110 transition-transform" />
              <span className="text-xl font-bold text-gray-900 tracking-tight">
                DeployMate
              </span>
            </Link>
            <nav className="flex items-center space-x-2 ml-8">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors duration-150
                      ${isActive
                        ? "bg-primary-100 text-primary-700 shadow-sm"
                        : "text-gray-700 hover:bg-gray-100 hover:text-primary-700"}
                    `}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span>Welcome,</span>
              <span className="font-medium text-gray-900">
                {user?.username}
              </span>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
