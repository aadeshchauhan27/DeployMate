import React from "react";
import { Project } from "../types";
import { ButtonWithLoader } from "./ButtonWithLoader";

interface Props {
  groupId: number;
  projects: Project[];
  groups: {
    id: number;
    name: string;
    projectIds: number[];
  }[];
  onAdd: (projectId: number) => void;
  onRemove: (projectId: number) => void;
  selectedProjectIds: number[];
  onBulkRelease: () => void;
  onBulkDeploy: () => void;
  loading: boolean;
  creatingRelease: boolean;
  bulkDeployBranch: string;
  setBulkDeployBranch: (branch: string) => void;
  releaseBranchName: string;
  setReleaseBranchName: (name: string) => void;
  groupBranches: { name: string }[];
}

export const ProjectsInGroupSection: React.FC<Props> = ({
  groupId,
  projects,
  groups,
  onAdd,
  onRemove,
  selectedProjectIds,
  onBulkRelease,
  onBulkDeploy,
  loading,
  creatingRelease,
  bulkDeployBranch,
  setBulkDeployBranch,
  releaseBranchName,
  setReleaseBranchName,
  groupBranches,
}) => {
  const currentGroup = groups.find((g) => g.id === groupId);
  const selectedProjects = currentGroup?.projectIds || [];

  return (
    <>
      <h2 className="font-semibold mb-2">Projects in Group</h2>
      <ul className="mb-4 space-y-2">
        {selectedProjects.map((pid) => {
          const project = projects.find((p) => p.id === pid);
          if (!project) return null;
          return (
            <li
              key={project.id}
              className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
            >
              <span>{project.name}</span>
              <button className="btn-danger text-xs" onClick={() => onRemove(project.id)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="font-semibold mb-2">Add Projects to Group</h2>
      <ul className="mb-4 space-y-2">
        {projects
          .filter((p) => !selectedProjects.includes(p.id))
          .map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
            >
              <span>{project.name}</span>
              <button className="btn-primary text-xs" onClick={() => onAdd(project.id)}>
                Add
              </button>
            </li>
          ))}
      </ul>

      <div className="mb-4">
        <h2 className="font-semibold mb-2">Bulk Create Release Branch</h2>
        <input
          className="input mb-2"
          type="text"
          placeholder="Release branch name (e.g. 1.0.0)"
          value={releaseBranchName}
          onChange={(e) => setReleaseBranchName(e.target.value)}
        />
        <ButtonWithLoader
          className="btn-primary"
          onClick={onBulkRelease}
          loading={creatingRelease}
          disabled={!releaseBranchName.trim()}
        >
          Create Release Branch for All
        </ButtonWithLoader>
      </div>

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
        <ButtonWithLoader
          className="btn-primary"
          onClick={onBulkDeploy}
          loading={loading}
          disabled={!bulkDeployBranch}
        >
          Deploy All
        </ButtonWithLoader>
      </div>
    </>
  );
};
