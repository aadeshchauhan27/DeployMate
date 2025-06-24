import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Gitlab,
  Play,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { projectsAPI } from "../services/api";
import { Project, Pipeline, Job, Environment } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { StatusBadge } from "../components/StatusBadge";
import { Message } from "../components/Message";
import { AppHeader } from "../components/AppHeader";

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, logout } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "pipelines" | "jobs" | "environments"
  >("pipelines");
  const navigate = useNavigate();
  const [branches, setBranches] = useState<any[]>([]);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseBranchName, setReleaseBranchName] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [creatingRelease, setCreatingRelease] = useState(false);
  const [selectedDeployBranch, setSelectedDeployBranch] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (projectId) {
      loadProjectData();
      projectsAPI.getBranches(parseInt(projectId)).then((branches) => {
        setBranches(branches);
        if (branches.length > 0) setSelectedDeployBranch(branches[0].name);
      });
    }
  }, [projectId]);

  const loadProjectData = async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      const [projectData, pipelinesData, jobsData, environmentsData] =
        await Promise.all([
          projectsAPI.getById(parseInt(projectId)),
          projectsAPI.getPipelines(parseInt(projectId)),
          projectsAPI.getJobs(parseInt(projectId)),
          projectsAPI.getEnvironments(parseInt(projectId)),
        ]);
      setProject(projectData);
      setPipelines(pipelinesData);
      setJobs(jobsData);
      setEnvironments(environmentsData);
    } catch (error) {
      console.error("Failed to load project data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!projectId) return;
    try {
      await projectsAPI.triggerPipeline(
        parseInt(projectId),
        selectedDeployBranch
      );
      setTimeout(() => {
        navigate("/pipelines");
      }, 1500);
    } catch (error) {
      console.error("Failed to trigger deployment:", error);
    }
  };

  const handleStopEnvironment = async (environmentId: number) => {
    if (!projectId) return;

    try {
      await projectsAPI.stopEnvironment(parseInt(projectId), environmentId);
      loadProjectData(); // Refresh data
    } catch (error) {
      console.error("Failed to stop environment:", error);
    }
  };

  const handleOpenReleaseModal = () => {
    setReleaseBranchName("");
    setSourceBranch(branches[0]?.name || "");
    setShowReleaseModal(true);
  };

  const handleCloseReleaseModal = () => {
    setShowReleaseModal(false);
  };

  const handleCreateReleaseBranchModal = async () => {
    if (!releaseBranchName || !sourceBranch) {
      setMessage({
        type: "error",
        text: "Please enter a release branch name and select a source branch.",
      });
      return;
    }
    setCreatingRelease(true);
    try {
      const res = await fetch(
        `http://localhost:3001/api/projects/${projectId}/branches/release`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            releaseNumber: releaseBranchName,
            ref: sourceBranch,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create release branch");
      const data = await res.json();
      setMessage({
        type: "success",
        text: `Release branch created! View: ${data.web_url}`,
      });
      setShowReleaseModal(false);
      // Refetch branches and select the new branch
      const updatedBranches = await projectsAPI.getBranches(
        parseInt(String(projectId))
      );
      setBranches(updatedBranches);
      setSelectedDeployBranch(String(releaseBranchName || ""));
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to create release branch",
      });
    } finally {
      setCreatingRelease(false);
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
        {/* Project Info */}
        {project && (
          <div className="card mb-8">
            <div className="flex items-start justify-between flex-wrap">
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                {project.avatar_url && (
                  <img
                    src={project.avatar_url}
                    alt={project.name}
                    className="w-16 h-16 rounded-lg"
                  />
                )}
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900 truncate">
                    {project.name}
                  </h1>
                  <p className="text-gray-600 truncate">
                    {project.name_with_namespace}
                  </p>
                  {project.description && (
                    <p className="text-gray-600 mt-2 truncate">
                      {project.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {/* Action Buttons Row */}
            <div className="flex flex-wrap gap-3 mt-4 items-center">
              <div>
                <select
                  className="input"
                  value={selectedDeployBranch}
                  onChange={(e) => setSelectedDeployBranch(e.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleDeploy}
                className="btn-primary flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>Deploy</span>
              </button>
              <button onClick={handleOpenReleaseModal} className="btn-primary">
                Create Release Branch
              </button>
              <a
                href={project.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center space-x-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>View in GitLab</span>
              </a>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: "pipelines", label: "Pipelines", count: pipelines.length },
              { id: "jobs", label: "Jobs", count: jobs.length },
              {
                id: "environments",
                label: "Environments",
                count: environments.length,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
                <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="card">
          {activeTab === "pipelines" && (
            <div className="space-y-4">
              {pipelines.map((pipeline) => (
                <div
                  key={pipeline.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-gray-900">
                        #{pipeline.iid}
                      </span>
                      <StatusBadge status={pipeline.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={pipeline.web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 text-sm"
                      >
                        View Details →
                      </a>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Branch:</span>{" "}
                      <a
                        href={`${project?.web_url}/-/tree/${pipeline.ref}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 underline"
                      >
                        {pipeline.ref}
                      </a>
                    </div>
                    <div>
                      <span className="font-medium">Commit:</span>{" "}
                      <a
                        href={`${project?.web_url}/-/commit/${pipeline.sha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 underline"
                      >
                        {pipeline.sha.substring(0, 8)}
                      </a>
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
                </div>
              ))}
              {pipelines.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No pipelines found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "jobs" && (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-gray-900">
                        {job.name}
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={job.web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 text-sm"
                      >
                        View Details →
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Stage:</span> {job.stage}
                    </div>
                    <div>
                      <span className="font-medium">Branch:</span> {job.ref}
                    </div>
                    <div>
                      <span className="font-medium">Started:</span>{" "}
                      {job.started_at
                        ? new Date(job.started_at).toLocaleString()
                        : "N/A"}
                    </div>
                    <div>
                      <span className="font-medium">Duration:</span>{" "}
                      {job.duration ? `${job.duration}s` : "N/A"}
                    </div>
                  </div>
                </div>
              ))}

              {jobs.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No jobs found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "environments" && (
            <div className="space-y-4">
              {environments.map((environment) => (
                <div
                  key={environment.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-gray-900">
                        {environment.name}
                      </span>
                      <StatusBadge
                        status={
                          environment.state === "available"
                            ? "success"
                            : "error"
                        }
                      />
                    </div>
                    <div className="flex space-x-2">
                      {environment.external_url && (
                        <a
                          href={environment.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm"
                        >
                          Visit
                        </a>
                      )}
                      {environment.state === "available" && (
                        <button
                          onClick={() => handleStopEnvironment(environment.id)}
                          className="btn-danger text-sm"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">State:</span>{" "}
                      {environment.state}
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>{" "}
                      {new Date(environment.created_at).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="font-medium">Updated:</span>{" "}
                      {new Date(environment.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}

              {environments.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No environments found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal for creating release branch */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Release Branch</h2>
            <div className="mb-4">
              <label className="block mb-1 font-medium">Source Branch</label>
              <select
                className="input"
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block mb-1 font-medium">
                Release Branch Name
              </label>
              <input
                className="input"
                type="text"
                placeholder="e.g. release/1.0.0"
                value={releaseBranchName}
                onChange={(e) => setReleaseBranchName(e.target.value)}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                className="btn-secondary"
                onClick={handleCloseReleaseModal}
                disabled={creatingRelease}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateReleaseBranchModal}
                disabled={creatingRelease}
              >
                {creatingRelease ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
