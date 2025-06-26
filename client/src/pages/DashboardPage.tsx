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
import { Message } from "../components/Message";
import { AppHeader } from "../components/AppHeader";

const CACHE_KEY_PROJECTS = 'dashboard_projects_cache';
const CACHE_KEY_PIPELINES = 'dashboard_pipelines_cache';
const CACHE_TTL = 60 * 1000; // 1 minute in ms

function getCache(key: string) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function setCache(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

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
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Try cache first
      const cachedProjects = getCache(CACHE_KEY_PROJECTS);
      let projectsData: Project[];
      if (cachedProjects) {
        projectsData = cachedProjects;
        setProjects(projectsData);
      } else {
        projectsData = await projectsAPI.getAll();
        setProjects(projectsData.slice(0, 10));
        setCache(CACHE_KEY_PROJECTS, projectsData);
      }
      // Optionally, fetch and append the rest in the background
      if (projectsData.length > 10) {
        setTimeout(() => {
          setProjects(projectsData);
        }, 1000);
      }
      // Pipelines cache
      if (projectsData.length > 0) {
        const cachedPipelines = getCache(CACHE_KEY_PIPELINES);
        if (cachedPipelines && cachedPipelines.projectId === projectsData[0].id) {
          setRecentPipelines(cachedPipelines.pipelines);
        } else {
          const pipelinesData = await projectsAPI.getPipelines(projectsData[0].id);
          setRecentPipelines(pipelinesData || []);
          setCache(CACHE_KEY_PIPELINES, { projectId: projectsData[0].id, pipelines: pipelinesData });
        }
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
        setMessage({
          type: "success",
          text: `✅ GitLab API Test Successful! User: ${result.user.username} Projects found: ${result.projectsCount} You should be able to deploy now!`,
        });
      } else {
        throw new Error(result.message || "Test failed");
      }
    } catch (error: any) {
      console.error("GitLab API test failed:", error);
      const errorMessage = error.message || "Unknown error occurred";
      setError(`GitLab API test failed: ${errorMessage}`);
      setMessage({
        type: "error",
        text: `❌ GitLab API Test Failed: ${errorMessage} This might be why deployments aren't working.`,
      });
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
      setMessage({
        type: "success",
        text: `Pipeline triggered successfully! Pipeline ID: ${result.id} View it at: ${result.web_url}`,
      });

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
      setMessage({
        type: "error",
        text: `Deployment failed for ${project.name}: ${errorMessage}`,
      });
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
      <AppHeader />
      {message && (
        <Message
          type={message.type}
          message={message.text}
          onClose={() => setMessage(null)}
        />
      )}
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
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow block focus:outline-none focus:ring-2 focus:ring-primary-500"
                    style={{ textDecoration: "none" }}
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
                        <a
                          href={project.web_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm text-center flex items-center justify-center space-x-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Gitlab className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
