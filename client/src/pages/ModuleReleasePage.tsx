import React, { useEffect, useState } from "react";
import { projectsAPI } from "../services/api";
import { AppHeader } from "../components/AppHeader";
import { Message } from "../components/Message";
import { ModuleReleaseMenu } from "../components/ModuleReleaseMenu";

interface ProjectGroup {
  id: number;
  name: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

export const ModuleReleasePage: React.FC = () => {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [releaseBranchName, setReleaseBranchName] = useState("");
  const [creatingRelease, setCreatingRelease] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [sourceBranch, setSourceBranch] = useState("");
  const [branchesLoading, setBranchesLoading] = useState(false);

  useEffect(() => {
    fetch(GROUPS_STORAGE_URL)
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch(() => setGroups([]));
  }, []);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // Fetch branches for the first project in the group when group changes
  useEffect(() => {
    if (!selectedGroupId) {
      setBranches([]);
      setSourceBranch("");
      return;
    }
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || group.projectIds.length === 0) {
      setBranches([]);
      setSourceBranch("");
      return;
    }
    const firstProjectId = group.projectIds[0];
    setBranchesLoading(true);
    projectsAPI.getBranches(firstProjectId).then((branches) => {
      setBranches(branches);
      if (branches.length > 0) setSourceBranch(branches[0].name);
      setBranchesLoading(false);
    }).catch(() => setBranchesLoading(false));
  }, [selectedGroupId, groups]);

  const handleBulkCreateReleaseBranch = async () => {
    if (!releaseBranchName.trim() || !selectedGroup || selectedGroup.projectIds.length === 0 || !sourceBranch) return;
    setCreatingRelease(true);
    try {
      await Promise.all(
        selectedGroup.projectIds.map((projectId) =>
          fetch(
            `http://localhost:3001/api/projects/${projectId}/branches/release`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ releaseNumber: releaseBranchName, ref: sourceBranch }),
            }
          )
        )
      );
      setMessage({
        type: "success",
        text: "Release branches created for selected group!",
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

  return (
    <>
      <AppHeader />
      <div className="max-w-2xl mx-auto py-8">
        {message && (
          <Message
            type={message.type}
            message={message.text}
            onClose={() => setMessage(null)}
          />
        )}
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-bold mb-4">Module Release</h1>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Select Module</label>
            <select
              className="input"
              value={selectedGroupId || ''}
              onChange={(e) => setSelectedGroupId(Number(e.target.value))}
            >
              <option value="">Select a module</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block mb-2 font-medium">Source Branch</label>
            <select
              className="input"
              value={sourceBranch}
              onChange={(e) => setSourceBranch(e.target.value)}
              disabled={branchesLoading}
            >
              <option value="">{branchesLoading ? 'Loading branches...' : 'Select branch'}</option>
              {!branchesLoading && branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <ModuleReleaseMenu
            releaseBranchName={releaseBranchName}
            setReleaseBranchName={setReleaseBranchName}
            onBulkRelease={handleBulkCreateReleaseBranch}
            creatingRelease={creatingRelease}
            disabled={!selectedGroupId}
          />
        </div>
      </div>
    </>
  );
}; 