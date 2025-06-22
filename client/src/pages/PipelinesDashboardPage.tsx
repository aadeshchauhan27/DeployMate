import React, { useState, useEffect } from "react";
import {
  Gitlab,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  Filter,
  Search,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { projectsAPI } from "../services/api";
import { Project, Pipeline } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { StatusBadge } from "../components/StatusBadge";

export const PipelinesDashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allPipelines, setAllPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [retryingPipelines, setRetryingPipelines] = useState<Set<number>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllPipelines();
  }, []);

  const loadAllPipelines = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all projects
      const projectsData = await projectsAPI.getAll();
      setProjects(projectsData);

      // Get pipelines for each project
      const pipelinesPromises = projectsData.map(async (project) => {
        try {
          const pipelines = await projectsAPI.getPipelines(project.id);
          return pipelines.map((pipeline) => ({
            ...pipeline,
            project_name: project.name,
            project_path: project.path_with_namespace,
            project_id: project.id,
          }));
        } catch (error) {
          console.error(
            `Failed to load pipelines for project ${project.name}:`,
            error
          );
          return [];
        }
      });

      const pipelinesResults = await Promise.all(pipelinesPromises);
      const allPipelinesData = pipelinesResults.flat();

      // Sort by creation date (newest first)
      allPipelinesData.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setAllPipelines(allPipelinesData);
    } catch (error) {
      console.error("Failed to load pipelines:", error);
      setError("Failed to load pipelines. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryPipeline = async (pipeline: Pipeline) => {
    try {
      setRetryingPipelines((prev) => new Set(prev).add(pipeline.id));
      setError(null);

      console.log(
        `🔄 Retrying pipeline ${pipeline.id} for project ${pipeline.project_name}`
      );

      // Retry the pipeline
      const response = await fetch(
        `http://localhost:3001/api/projects/${pipeline.project_id}/pipelines/${pipeline.id}/retry`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to retry pipeline: ${response.statusText}`);
      }

      const result = await response.json();

      console.log("✅ Pipeline retry successful:", result);

      // Show success message
      alert(
        `Pipeline retry successful!\nNew Pipeline ID: ${result.id}\nView it at: ${result.web_url}`
      );

      // Refresh data
      await loadAllPipelines();
    } catch (error: any) {
      console.error("❌ Pipeline retry failed:", error);

      const errorMessage = error.message || "Unknown error occurred";
      setError(`Failed to retry pipeline: ${errorMessage}`);

      alert(`Pipeline retry failed:\n\n${errorMessage}`);
    } finally {
      setRetryingPipelines((prev) => {
        const newSet = new Set(prev);
        newSet.delete(pipeline.id);
        return newSet;
      });
    }
  };

  const filteredPipelines = allPipelines.filter((pipeline) => {
    const matchesSearch =
      pipeline.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      false ||
      pipeline.project_path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      false ||
      pipeline.ref.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || pipeline.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusCounts = () => {
    const counts = {
      all: allPipelines.length,
      running: 0,
      pending: 0,
      success: 0,
      failed: 0,
      canceled: 0,
      skipped: 0,
    };
    allPipelines.forEach((pipeline) => {
      counts[pipeline.status as keyof typeof counts]++;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

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
                Pipelines Dashboard
              </span>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          {[
            { key: "all", label: "Total", color: "bg-gray-100 text-gray-800" },
            {
              key: "running",
              label: "Running",
              color: "bg-blue-100 text-blue-800",
            },
            {
              key: "pending",
              label: "Pending",
              color: "bg-yellow-100 text-yellow-800",
            },
            {
              key: "success",
              label: "Success",
              color: "bg-green-100 text-green-800",
            },
            {
              key: "failed",
              label: "Failed",
              color: "bg-red-100 text-red-800",
            },
            {
              key: "canceled",
              label: "Canceled",
              color: "bg-gray-100 text-gray-800",
            },
            {
              key: "skipped",
              label: "Skipped",
              color: "bg-purple-100 text-purple-800",
            },
          ].map(({ key, label, color }) => (
            <div
              key={key}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
            >
              <div className="text-2xl font-bold text-gray-900">
                {statusCounts[key as keyof typeof statusCounts]}
              </div>
              <div
                className={`text-sm font-medium ${color} px-2 py-1 rounded-full inline-block mt-1`}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search projects, branches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input max-w-xs"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
              <option value="skipped">Skipped</option>
            </select>

            <button
              onClick={loadAllPipelines}
              className="btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Pipelines List */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              All Pipelines
            </h2>
            <span className="text-sm text-gray-500">
              {filteredPipelines.length} pipelines
            </span>
          </div>

          <div className="space-y-4">
            {filteredPipelines.map((pipeline) => (
              <div
                key={`${pipeline.project_id}-${pipeline.id}`}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          #{pipeline.iid}
                        </span>
                        <StatusBadge status={pipeline.status} />
                      </div>
                      <span className="text-gray-400">|</span>
                      <span className="font-medium text-gray-900">
                        {pipeline.project_name}
                      </span>
                      <span className="text-sm text-gray-500">
                        ({pipeline.project_path})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Branch:</span>{" "}
                        {pipeline.ref}
                      </div>
                      <div>
                        <span className="font-medium">Commit:</span>{" "}
                        {pipeline.sha.substring(0, 8)}
                      </div>
                      <div>
                        <span className="font-medium">Started:</span>{" "}
                        {new Date(pipeline.created_at).toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Duration:</span>{" "}
                        {pipeline.duration ? `${pipeline.duration}s` : "N/A"}
                      </div>
                    </div>

                    {pipeline.user && (
                      <div className="mt-2 text-sm text-gray-500">
                        <span className="font-medium">Triggered by:</span>{" "}
                        {pipeline.user.name} ({pipeline.user.username})
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col space-y-2 ml-4">
                    {pipeline.status === "failed" && (
                      <button
                        onClick={() => handleRetryPipeline(pipeline)}
                        disabled={retryingPipelines.has(pipeline.id)}
                        className={`btn-primary text-sm flex items-center space-x-2 ${
                          retryingPipelines.has(pipeline.id)
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        {retryingPipelines.has(pipeline.id) ? (
                          <>
                            <LoadingSpinner size="sm" />
                            <span>Retrying...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            <span>Retry</span>
                          </>
                        )}
                      </button>
                    )}

                    <a
                      href={pipeline.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-sm flex items-center space-x-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>View</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredPipelines.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No pipelines found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
