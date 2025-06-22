import React, { useEffect, useState } from "react";
import { projectsAPI } from "../services/api";
import { Project } from "../types";
import { useNavigate, Link } from "react-router-dom";
import { Gitlab } from "lucide-react";
import { Message } from "../components/Message";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ButtonWithLoader } from "../components/ButtonWithLoader";
import { AppHeader } from "../components/AppHeader";

interface ProjectGroup {
  id: number;
  name: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

export const GroupsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [releaseBranchName, setReleaseBranchName] = useState("");
  const [bulkDeployBranch, setBulkDeployBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingRelease, setCreatingRelease] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    projectsAPI.getAll().then(setProjects);
    // Load groups from JSON file
    fetch(GROUPS_STORAGE_URL)
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch(() => setGroups([]));
  }, []);

  // Group management (in-memory for now)
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    setGroups([
      ...groups,
      {
        id: Date.now(),
        name: newGroupName,
        projectIds: [],
      },
    ]);
    setNewGroupName("");
  };

  const handleAddProjectToGroup = (projectId: number) => {
    if (selectedGroupId == null) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === selectedGroupId && !g.projectIds.includes(projectId)
          ? { ...g, projectIds: [...g.projectIds, projectId] }
          : g
      )
    );
  };

  const handleRemoveProjectFromGroup = (projectId: number) => {
    if (selectedGroupId == null) return;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === selectedGroupId
          ? { ...g, projectIds: g.projectIds.filter((id) => id !== projectId) }
          : g
      )
    );
  };

  const handleSelectGroup = (groupId: number) => {
    setSelectedGroupId(groupId);
    setSelectedProjectIds(
      groups.find((g) => g.id === groupId)?.projectIds || []
    );
  };

  // Bulk actions
  const handleBulkCreateReleaseBranch = async () => {
    if (!releaseBranchName.trim() || selectedProjectIds.length === 0) return;
    setCreatingRelease(true);
    try {
      await Promise.all(
        selectedProjectIds.map((projectId) =>
          fetch(
            `http://localhost:3001/api/projects/${projectId}/branches/release`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ releaseNumber: releaseBranchName }),
            }
          )
        )
      );
      setMessage({
        type: "success",
        text: "Release branches created for selected projects!",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to create release branches",
      });
    } finally {
      setCreatingRelease(false);
    }
  };

  // Get available branches for the selected group (from the first project in the group)
  const groupBranches = React.useMemo(() => {
    if (!selectedGroupId) return [];
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || group.projectIds.length === 0) return [];
    const firstProject = projects.find((p) => p.id === group.projectIds[0]);
    return firstProject && (firstProject as any).branches
      ? (firstProject as any).branches
      : [];
  }, [selectedGroupId, groups, projects]);

  // Fetch branches for the first project in the group when group changes
  React.useEffect(() => {
    if (!selectedGroupId) return;
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || group.projectIds.length === 0) return;
    const firstProjectId = group.projectIds[0];
    projectsAPI.getBranches(firstProjectId).then((branches) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === firstProjectId ? { ...p, branches } : p))
      );
    });
  }, [selectedGroupId, groups]);

  const handleBulkDeploy = async () => {
    if (!bulkDeployBranch.trim() || selectedProjectIds.length === 0) return;
    setLoading(true);
    try {
      // 1. Fetch branches for all selected projects
      const branchesResults = await Promise.all(
        selectedProjectIds.map(async (projectId) => {
          const branches = await projectsAPI.getBranches(projectId);
          return { projectId, branches };
        })
      );
      // 2. Check if the selected branch exists in each project
      const missing = branchesResults.filter(
        (result) =>
          !result.branches.some((b: any) => b.name === bulkDeployBranch)
      );
      if (missing.length > 0) {
        // 3. Show error message listing missing projects
        const missingNames = missing
          .map((m) => {
            const p = projects.find((proj) => proj.id === m.projectId);
            return p ? p.name : `ID ${m.projectId}`;
          })
          .join(", ");
        setMessage({
          type: "error",
          text: `The branch '${bulkDeployBranch}' does not exist in: ${missingNames}`,
        });
        setLoading(false);
        return;
      }
      // 4. Proceed with deployment if all projects have the branch
      await Promise.all(
        selectedProjectIds.map((projectId) =>
          projectsAPI.triggerPipeline(projectId, bulkDeployBranch)
        )
      );
      setMessage({
        type: "success",
        text: "Bulk deployment triggered for selected projects!",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to trigger bulk deployment",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save groups to backend
  const handleSaveGroups = async () => {
    setLoading(true);
    try {
      await fetch(GROUPS_STORAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groups),
      });
      setMessage({ type: "success", text: "Groups saved!" });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to save groups",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppHeader />
      <div className="max-w-4xl mx-auto py-8">
        {message && (
          <Message
            type={message.type}
            message={message.text}
            onClose={() => setMessage(null)}
          />
        )}
        <h1 className="text-2xl font-bold mb-6">
          Project Groups & Bulk Actions
        </h1>
        <div className="mb-6 flex gap-4 items-end">
          <input
            className="input"
            type="text"
            placeholder="New group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <button className="btn-primary" onClick={handleCreateGroup}>
            Create Group
          </button>
          <ButtonWithLoader
            className="btn-secondary"
            onClick={handleSaveGroups}
            loading={loading}
          >
            Save Group
          </ButtonWithLoader>
        </div>
        <div className="flex gap-8">
          {/* Groups List */}
          <div className="w-1/3">
            <h2 className="font-semibold mb-2">Groups</h2>
            <ul className="space-y-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                      selectedGroupId === group.id
                        ? "bg-primary-100 text-primary-800 font-bold"
                        : "hover:bg-gray-100"
                    }`}
                    onClick={() => handleSelectGroup(group.id)}
                  >
                    {group.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {/* Projects in Group & Actions */}
          <div className="flex-1">
            {selectedGroupId ? (
              <>
                <h2 className="font-semibold mb-2">Projects in Group</h2>
                <ul className="mb-4 space-y-2">
                  {groups
                    .find((g) => g.id === selectedGroupId)
                    ?.projectIds.map((pid) => {
                      const project = projects.find((p) => p.id === pid);
                      if (!project) return null;
                      return (
                        <li
                          key={project.id}
                          className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
                        >
                          <span>{project.name}</span>
                          <button
                            className="btn-danger text-xs"
                            onClick={() =>
                              handleRemoveProjectFromGroup(project.id)
                            }
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                </ul>
                <h2 className="font-semibold mb-2">Add Projects to Group</h2>
                <ul className="mb-4 space-y-2">
                  {projects
                    .filter(
                      (p) =>
                        !groups
                          .find((g) => g.id === selectedGroupId)
                          ?.projectIds.includes(p.id)
                    )
                    .map((project) => (
                      <li
                        key={project.id}
                        className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
                      >
                        <span>{project.name}</span>
                        <button
                          className="btn-primary text-xs"
                          onClick={() => handleAddProjectToGroup(project.id)}
                        >
                          Add
                        </button>
                      </li>
                    ))}
                </ul>
                <div className="mb-4">
                  <h2 className="font-semibold mb-2">
                    Bulk Create Release Branch
                  </h2>
                  <input
                    className="input mb-2"
                    type="text"
                    placeholder="Release branch name (e.g. 1.0.0)"
                    value={releaseBranchName}
                    onChange={(e) => setReleaseBranchName(e.target.value)}
                  />
                  <ButtonWithLoader
                    className="btn-primary"
                    onClick={handleBulkCreateReleaseBranch}
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
                    {groupBranches.map((branch: any) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <ButtonWithLoader
                    className="btn-primary"
                    onClick={handleBulkDeploy}
                    loading={loading}
                    disabled={!bulkDeployBranch}
                  >
                    Deploy All
                  </ButtonWithLoader>
                </div>
              </>
            ) : (
              <div className="text-gray-500">
                Select a group to manage projects and bulk actions.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
