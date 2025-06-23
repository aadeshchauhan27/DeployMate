import React, { useEffect, useState, useMemo, useRef } from "react";
import { projectsAPI } from "../services/api";
import { AppHeader } from "../components/AppHeader";
import { Message } from "../components/Message";
import { BulkDeployMenu } from "../components/BulkDeployMenu";
import axios from "axios";

interface ProjectGroup {
  id: number;
  name: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

export const BulkDeployPage: React.FC = () => {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [bulkDeployBranch, setBulkDeployBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [deployStartTime, setDeployStartTime] = useState<Date | null>(null);
  const [envStatus, setEnvStatus] = useState<{ [env: string]: 'idle' | 'deploying' | 'success' | 'failed' }>({ QA: 'idle', Stage: 'idle', Production: 'idle' });
  const lastDeployedBranch = useRef<string>("");
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch(GROUPS_STORAGE_URL)
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch(() => setGroups([]));
    projectsAPI.getAll().then(setProjects);
  }, []);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // Get available branches for the selected group (from the first project in the group)
  const groupBranches = useMemo(() => {
    if (!selectedGroupId) return [];
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || group.projectIds.length === 0) return [];
    const firstProject = projects.find((p) => p.id === group.projectIds[0]);
    return firstProject && (firstProject as any).branches
      ? (firstProject as any).branches
      : [];
  }, [selectedGroupId, groups, projects]);

  // Fetch branches for the first project in the group when group changes
  useEffect(() => {
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

  // Fetch history on mount and after new deploy
  const fetchHistory = async () => {
    const res = await axios.get("/api/bulk-deployments");
    setHistory(res.data);
  };
  useEffect(() => { fetchHistory(); }, []);

  const handleBulkDeploy = async () => {
    if (!bulkDeployBranch.trim() || !selectedGroup || selectedGroup.projectIds.length === 0) return;
    setLoading(true);
    setDeployStartTime(new Date());
    lastDeployedBranch.current = bulkDeployBranch;
    try {
      // 1. Fetch branches for all selected projects
      const branchesResults = await Promise.all(
        selectedGroup.projectIds.map(async (projectId) => {
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
        selectedGroup.projectIds.map((projectId) =>
          projectsAPI.triggerPipeline(projectId, bulkDeployBranch)
        )
      );
      // Record in backend
      await axios.post("/api/bulk-deployments", {
        module: selectedGroup.name,
        branch: bulkDeployBranch,
        started: new Date().toISOString(),
        environments: envStatus,
      });
      fetchHistory();
      setMessage({
        type: "success",
        text: "Bulk deployment triggered for selected module!",
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

  // Environment deploy handler
  const handleEnvDeploy = async (env: string) => {
    if (!bulkDeployBranch.trim() || !selectedGroup || selectedGroup.projectIds.length === 0) return;
    setEnvStatus((prev) => ({ ...prev, [env]: 'deploying' }));
    try {
      // Pass environment as a variable object
      await Promise.all(selectedGroup.projectIds.map((projectId) =>
        projectsAPI.triggerPipeline(projectId, bulkDeployBranch, { ENVIRONMENT: env })
      ));
      setEnvStatus((prev) => ({ ...prev, [env]: 'success' }));
    } catch (err) {
      setEnvStatus((prev) => ({ ...prev, [env]: 'failed' }));
    }
  };

  // Helper to check if branch is a release branch
  const isReleaseBranch = bulkDeployBranch.startsWith('release/');
  const isDevelopBranch = bulkDeployBranch === 'develop' || bulkDeployBranch === 'master';

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
          <h1 className="text-2xl font-bold mb-4">Bulk Deployment</h1>
          {/* Details Row */}
          {selectedGroup && (
            <div className="mb-4 p-4 bg-gray-50 rounded border flex flex-col gap-2">
              <div><span className="font-medium">Module:</span> {selectedGroup.name}</div>
              <div><span className="font-medium">Branch:</span> {bulkDeployBranch || '-'}</div>
              <div><span className="font-medium">Started:</span> {deployStartTime ? deployStartTime.toLocaleString() : '-'}</div>
            </div>
          )}
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
          <BulkDeployMenu
            bulkDeployBranch={bulkDeployBranch}
            setBulkDeployBranch={setBulkDeployBranch}
            groupBranches={groupBranches}
            onBulkDeploy={handleBulkDeploy}
            loading={loading}
            disabled={!selectedGroupId}
          />
          {/* Environment Buttons for Release Branches or Develop/Master */}
          {isReleaseBranch && selectedGroup && (
            <div className="flex gap-4 mt-4">
              <button
                onClick={() => handleEnvDeploy('QA')}
                disabled={envStatus['QA'] === 'deploying' || !bulkDeployBranch}
                className={`px-4 py-2 rounded font-semibold transition-colors
                  ${envStatus['QA'] === 'success' ? 'bg-green-500 text-white' :
                    envStatus['QA'] === 'failed' ? 'bg-red-500 text-white' :
                    envStatus['QA'] === 'deploying' ? 'bg-yellow-400 text-white' :
                    'bg-gray-200 text-gray-900 hover:bg-gray-300'}
                `}
              >
                {envStatus['QA'] === 'deploying' ? `Deploying QA...` :
                  envStatus['QA'] === 'success' ? `QA Deployed` :
                  envStatus['QA'] === 'failed' ? `QA Failed` :
                  `Deploy to QA`}
              </button>
              <button
                onClick={() => handleEnvDeploy('Stage')}
                disabled={envStatus['Stage'] === 'deploying' || envStatus['QA'] !== 'success' || !bulkDeployBranch}
                className={`px-4 py-2 rounded font-semibold transition-colors
                  ${envStatus['Stage'] === 'success' ? 'bg-green-500 text-white' :
                    envStatus['Stage'] === 'failed' ? 'bg-red-500 text-white' :
                    envStatus['Stage'] === 'deploying' ? 'bg-yellow-400 text-white' :
                    'bg-gray-200 text-gray-900 hover:bg-gray-300'}
                `}
              >
                {envStatus['Stage'] === 'deploying' ? `Deploying Stage...` :
                  envStatus['Stage'] === 'success' ? `Stage Deployed` :
                  envStatus['Stage'] === 'failed' ? `Stage Failed` :
                  `Deploy to Stage`}
              </button>
              <button
                onClick={() => handleEnvDeploy('Production')}
                disabled={envStatus['Production'] === 'deploying' || envStatus['Stage'] !== 'success' || !bulkDeployBranch}
                className={`px-4 py-2 rounded font-semibold transition-colors
                  ${envStatus['Production'] === 'success' ? 'bg-green-500 text-white' :
                    envStatus['Production'] === 'failed' ? 'bg-red-500 text-white' :
                    envStatus['Production'] === 'deploying' ? 'bg-yellow-400 text-white' :
                    'bg-gray-200 text-gray-900 hover:bg-gray-300'}
                `}
              >
                {envStatus['Production'] === 'deploying' ? `Deploying Production...` :
                  envStatus['Production'] === 'success' ? `Production Deployed` :
                  envStatus['Production'] === 'failed' ? `Production Failed` :
                  `Deploy to Production`}
              </button>
            </div>
          )}
          {isDevelopBranch && selectedGroup && (
            <div className="flex gap-4 mt-4">
              <button
                onClick={() => handleEnvDeploy('Develop')}
                disabled={envStatus['Develop'] === 'deploying' || !bulkDeployBranch}
                className={`px-4 py-2 rounded font-semibold transition-colors
                  ${envStatus['Develop'] === 'success' ? 'bg-green-500 text-white' :
                    envStatus['Develop'] === 'failed' ? 'bg-red-500 text-white' :
                    envStatus['Develop'] === 'deploying' ? 'bg-yellow-400 text-white' :
                    'bg-gray-200 text-gray-900 hover:bg-gray-300'}
                `}
              >
                {envStatus['Develop'] === 'deploying' ? `Deploying Develop...` :
                  envStatus['Develop'] === 'success' ? `Develop Deployed` :
                  envStatus['Develop'] === 'failed' ? `Develop Failed` :
                  `Deploy to Develop`}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Bulk Deployment History */}
      <div className="max-w-2xl mx-auto mt-10">
        <h2 className="text-xl font-bold mb-4">Bulk Deployment History</h2>
        <div className="space-y-4">
          {history.length === 0 && <div className="text-gray-500">No history yet.</div>}
          {history.map((item) => (
            <div key={item.id} className="p-4 bg-white rounded shadow flex flex-col md:flex-row md:items-center md:justify-between gap-2 border">
              <div>
                <div><span className="font-medium">Module:</span> {item.module}</div>
                <div><span className="font-medium">Branch:</span> {item.branch}</div>
                <div><span className="font-medium">Started:</span> {new Date(item.started).toLocaleString()}</div>
              </div>
              <div className="flex gap-2 mt-2 md:mt-0">
                {['QA', 'Stage', 'Production', 'Develop'].map((env) => (
                  <button
                    key={env}
                    disabled
                    className={`px-3 py-1 rounded font-semibold text-xs
                      ${item.environments?.[env] === 'success' ? 'bg-green-500 text-white' :
                        item.environments?.[env] === 'failed' ? 'bg-red-500 text-white' :
                        item.environments?.[env] === 'deploying' ? 'bg-yellow-400 text-white' :
                        'bg-gray-200 text-gray-900'}
                    `}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}; 