import React, { useState, useEffect } from "react";
import {
  Gitlab,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  Filter,
  Search,
  AlertCircle,
  Home,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { projectsAPI } from "../services/api";
import { Project, Pipeline } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { StatusBadge } from "../components/StatusBadge";
import { PipelinesList } from "../components/PipelinesList";
import { AppHeader } from "../components/AppHeader";

interface ProjectGroup {
  id: number;
  name: string;
  description?: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

export const PipelinesDashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allPipelines, setAllPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [retryingPipelines, setRetryingPipelines] = useState<Set<number>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>("all");

  useEffect(() => {
    loadAllPipelines(true);
    // Load groups
    setGroupsLoading(true);
    fetch(GROUPS_STORAGE_URL)
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));
  }, []);

  const loadAllPipelines = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setPipelinesLoading(true);
      }
      setError(null);

      // Get all projects
      const projectsData = await projectsAPI.getAll();
      setProjects(projectsData);

      // Fetch pipelines for first 10 projects
      const initialProjects = projectsData.slice(0, 10);
      const pipelinesPromises = initialProjects.map(async (project) => {
        try {
          const pipelines = await projectsAPI.getPipelines(project.id);
          return pipelines.map((pipeline) => ({
            ...pipeline,
            project_name: project.name,
            project_path: project.path_with_namespace,
            project_id: project.id,
          }));
        } catch (error) {
          console.error(`Failed to load pipelines for project ${project.name}:`, error);
          return [];
        }
      });
      const pipelinesResults = await Promise.all(pipelinesPromises);
      const allPipelinesData = pipelinesResults.flat();
      // Sort by creation date (newest first)
      allPipelinesData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllPipelines(allPipelinesData);

      // Fetch the rest in the background
      const restProjects = projectsData.slice(10);
      if (restProjects.length > 0) {
        const restPipelinesPromises = restProjects.map(async (project) => {
          try {
            const pipelines = await projectsAPI.getPipelines(project.id);
            return pipelines.map((pipeline) => ({
              ...pipeline,
              project_name: project.name,
              project_path: project.path_with_namespace,
              project_id: project.id,
            }));
          } catch (error) {
            console.error(`Failed to load pipelines for project ${project.name}:`, error);
            return [];
          }
        });
        const restPipelinesResults = await Promise.all(restPipelinesPromises);
        const restPipelinesData = restPipelinesResults.flat();
        restPipelinesData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllPipelines(prev => {
          // Merge and deduplicate by pipeline id
          const merged = [...prev, ...restPipelinesData];
          const seen = new Set();
          return merged.filter(p => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        });
      }
    } catch (error) {
      console.error("Failed to load pipelines:", error);
      setError("Failed to load pipelines. Please try again.");
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setPipelinesLoading(false);
      }
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

    const matchesGroup =
      groupFilter === "all" ||
      (pipeline.project_id &&
        groups.some(
          (g) => g.id.toString() === groupFilter && g.projectIds.includes(pipeline.project_id)
        ));

    return matchesSearch && matchesStatus && matchesGroup;
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

  // Map project_id to group name
  const projectIdToGroupName: Record<number, string> = React.useMemo(() => {
    const map: Record<number, string> = {};
    groups.forEach((group) => {
      group.projectIds.forEach((pid) => {
        map[pid] = group.name;
      });
    });
    return map;
  }, [groups]);

  if (loading || groupsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

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
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="input max-w-xs"
            >
              <option value="all">All Groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id.toString()}>
                  {group.name}
                </option>
              ))}
            </select>

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
              onClick={() => loadAllPipelines(false)}
              className="btn-secondary flex items-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Pipelines List */}
        <PipelinesList
          pipelines={filteredPipelines}
          loading={pipelinesLoading}
          retryingPipelines={retryingPipelines}
          handleRetryPipeline={handleRetryPipeline}
          error={error}
          projectIdToGroupName={projectIdToGroupName}
        />
      </div>
    </div>
  );
};
