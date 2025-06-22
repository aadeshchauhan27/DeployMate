import React, { useState, useEffect } from "react";
import {
  Gitlab,
  Plus,
  Search,
  Filter,
  RefreshCw,
  TestTube,
  BarChart3,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { projectsAPI } from "../services/api";
import { Project, Pipeline } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { StatusBadge } from "../components/StatusBadge";
import { Link } from "react-router-dom";

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentPipelines, setRecentPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [deployingProjects, setDeployingProjects] = useState<Set<number>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectsData = await projectsAPI.getAll();
      setProjects(projectsData);

      if (projectsData.length > 0) {
        const pipelinesData = await projectsAPI.getPipelines(
          projectsData[0].id
        );
        setRecentPipelines(pipelinesData || []);
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      setError("Failed to load projects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const testGitLabAPI = async () => {
    try {
      setTesting(true);
      setError(null);

      const response = await fetch("http://localhost:3001/api/test-gitlab", {
        credentials: "include",
      });

      const result = await response.json();

      if (result.success) {
        alert(
          `✅ GitLab API Test Successful!\n\nUser: ${result.user.username}\nProjects found: ${result.projectsCount}\n\nYou should be able to deploy now!`
        );
      } else {
        throw new Error(result.message || "Test failed");
      }
    } catch (error: any) {
      console.error("GitLab API test failed:", error);
      const errorMessage = error.message || "Unknown error occurred";
      setError(`GitLab API test failed: ${errorMessage}`);
      alert(
        `❌ GitLab API Test Failed:\n\n${errorMessage}\n\nThis might be why deployments aren't working.`
      );
    } finally {
      setTesting(false);
    }
  };

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.name_with_namespace
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  const handleDeploy = async (project: Project) => {
    try {
      setDeployingProjects((prev) => new Set(prev).add(project.id));
      setError(null);

      console.log(`🚀 Deploying project: ${project.name} (ID: ${project.id})`);

      const result = await projectsAPI.triggerPipeline(project.id);

      console.log("✅ Deployment successful:", result);

      // Show success message
      alert(
        `Pipeline triggered successfully!\nPipeline ID: ${result.id}\nView it at: ${result.web_url}`
      );

      // Refresh data after deployment
      await loadData();
    } catch (error: any) {
      console.error("❌ Deployment failed:", error);

      const errorMessage =
        error.response?.data?.details ||
        error.response?.data?.error ||
        error.message ||
        "Unknown error occurred";
      setError(`Failed to deploy ${project.name}: ${errorMessage}`);

      // Show detailed error to user
      alert(`Deployment failed for ${project.name}:\n\n${errorMessage}`);
    } finally {
      setDeployingProjects((prev) => {
        const newSet = new Set(prev);
        newSet.delete(project.id);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Gitlab className="w-8 h-8 text-primary-600" />
                <h1 className="text-xl font-bold text-gray-900">DeployMate</h1>
              </div>
              <span className="text-gray-400">|</span>
              <span className="text-lg font-medium text-gray-700">
                Projects Dashboard
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <Link
                to="/pipelines"
                className="btn-secondary text-sm flex items-center space-x-2"
              >
                <BarChart3 className="w-4 h-4" />
                <span>All Pipelines</span>
              </Link>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
            <button
              onClick={testGitLabAPI}
              disabled={testing}
              className="btn-secondary flex items-center space-x-2"
            >
              {testing ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <TestTube className="w-4 h-4" />
                  <span>Test API</span>
                </>
              )}
            </button>
            <button
              onClick={loadData}
              className="btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Projects List */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Your Projects
                </h2>
                <span className="text-sm text-gray-500">
                  {filteredProjects.length} projects
                </span>
              </div>

              <div className="space-y-4">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {project.avatar_url && (
                            <img
                              src={project.avatar_url}
                              alt={project.name}
                              className="w-8 h-8 rounded"
                            />
                          )}
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {project.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {project.name_with_namespace}
                            </p>
                          </div>
                        </div>
                        {project.description && (
                          <p className="text-sm text-gray-600 mb-3">
                            {project.description}
                          </p>
                        )}
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>Branch: {project.default_branch}</span>
                          <span>Visibility: {project.visibility}</span>
                          <span>
                            Updated:{" "}
                            {new Date(
                              project.last_activity_at
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={() => handleDeploy(project)}
                          disabled={deployingProjects.has(project.id)}
                          className={`btn-primary text-sm flex items-center space-x-2 ${
                            deployingProjects.has(project.id)
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          {deployingProjects.has(project.id) ? (
                            <>
                              <LoadingSpinner size="sm" />
                              <span>Deploying...</span>
                            </>
                          ) : (
                            <>
                              <span>Deploy</span>
                            </>
                          )}
                        </button>
                        <a
                          href={project.web_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm"
                        >
                          View
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredProjects.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No projects found</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Recent Pipelines
              </h2>

              <div className="space-y-4">
                {recentPipelines.slice(0, 5).map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        #{pipeline.iid}
                      </span>
                      <StatusBadge status={pipeline.status} />
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div>Branch: {pipeline.ref}</div>
                      <div>Commit: {pipeline.sha.substring(0, 8)}</div>
                      <div>
                        Started:{" "}
                        {new Date(pipeline.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="mt-3">
                      <a
                        href={pipeline.web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:text-primary-700"
                      >
                        View Details →
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {recentPipelines.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No recent pipelines</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
