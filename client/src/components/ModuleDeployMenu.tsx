import React from "react";
import { ButtonWithLoader } from "./ButtonWithLoader";

interface Props {
  bulkDeployBranch: string;
  setBulkDeployBranch: (branch: string) => void;
  groupBranches: { name: string }[];
  onBulkDeploy: () => void;
  loading: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export const ModuleDeployMenu: React.FC<Props> = ({
  bulkDeployBranch,
  setBulkDeployBranch,
  groupBranches,
  onBulkDeploy,
  loading,
  disabled,
  compact = false,
}) => {
  // Helper to check branch type
  const isReleaseBranch = bulkDeployBranch.startsWith('release/');
  const isDevelopBranch = bulkDeployBranch === 'develop' || bulkDeployBranch === 'master';

  if (compact) {
    return (
      <div className="flex items-end gap-2">
        <select
          className="input px-2 py-1 text-sm min-w-[140px] max-w-[180px]"
          value={bulkDeployBranch}
          onChange={(e) => setBulkDeployBranch(e.target.value)}
        >
          <option value="">Select branch</option>
          {groupBranches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))}
        </select>
        {isDevelopBranch && (
          <ButtonWithLoader
            className="btn-primary px-3 py-1 text-sm"
            onClick={onBulkDeploy}
            loading={loading}
            disabled={disabled || !bulkDeployBranch}
          >
            Deploy to Develop
          </ButtonWithLoader>
        )}
        {isReleaseBranch && (
          <ButtonWithLoader
            className="btn-primary px-3 py-1 text-sm"
            onClick={onBulkDeploy}
            loading={loading}
            disabled={disabled || !bulkDeployBranch}
          >
            Deploy to QA
          </ButtonWithLoader>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-semibold mb-2">Module Deploy</h2>
      <select
        className="input mb-2"
        value={bulkDeployBranch}
        onChange={(e) => setBulkDeployBranch(e.target.value)}
      >
        <option value="">Select branch</option>
        {groupBranches.map((branch) => (
          <option key={branch.name} value={branch.name}>
            {branch.name}
          </option>
        ))}
      </select>
      {/* Show correct button based on branch */}
      {isDevelopBranch && (
        <ButtonWithLoader
          className="btn-primary"
          onClick={onBulkDeploy}
          loading={loading}
          disabled={disabled || !bulkDeployBranch}
        >
          Deploy to Develop
        </ButtonWithLoader>
      )}
      {isReleaseBranch && (
        <ButtonWithLoader
          className="btn-primary"
          onClick={onBulkDeploy}
          loading={loading}
          disabled={disabled || !bulkDeployBranch}
        >
          Deploy to QA
        </ButtonWithLoader>
      )}
    </div>
  );
}; 