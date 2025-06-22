import React from "react";
import { Pipeline } from "../types";
import { StatusBadge } from "./StatusBadge";
import { LoadingSpinner } from "./LoadingSpinner";
import { RotateCcw, RefreshCw, ExternalLink } from "lucide-react";

interface PipelinesListProps {
  pipelines: Pipeline[];
  loading: boolean;
  retryingPipelines: Set<number>;
  handleRetryPipeline: (pipeline: Pipeline) => void;
  error: string | null;
}

export const PipelinesList: React.FC<PipelinesListProps> = ({
  pipelines,
  loading,
  retryingPipelines,
  handleRetryPipeline,
  error,
}) => {
  return (
    <div className="card relative">
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-60 flex items-center justify-center z-10 rounded-lg">
          <LoadingSpinner size="md" />
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">All Pipelines</h2>
        <span className="text-sm text-gray-500">
          {pipelines.length} pipelines
        </span>
      </div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 text-sm">
          {error}
        </div>
      )}
      <div className="space-y-4">
        {pipelines.map((pipeline) => (
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
                    <span className="font-medium">Branch:</span> {pipeline.ref}
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
                  <span>View on GitLab</span>
                </a>
              </div>
            </div>
          </div>
        ))}
        {pipelines.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-8">
            No pipelines found.
          </div>
        )}
      </div>
    </div>
  );
};
