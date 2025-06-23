import React from "react";
import { ButtonWithLoader } from "./ButtonWithLoader";

interface Props {
  bulkDeployBranch: string;
  setBulkDeployBranch: (branch: string) => void;
  groupBranches: { name: string }[];
  onBulkDeploy: () => void;
  loading: boolean;
  disabled?: boolean;
}

export const BulkDeployMenu: React.FC<Props> = ({
  bulkDeployBranch,
  setBulkDeployBranch,
  groupBranches,
  onBulkDeploy,
  loading,
  disabled,
}) => {
  // Helper to check branch type
  const isReleaseBranch = bulkDeployBranch.startsWith('release/');
  const isDevelopBranch = bulkDeployBranch === 'develop' || bulkDeployBranch === 'master';

  return (
    <div>
      <h2 className="font-semibold mb-2">Bulk Deploy</h2>
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