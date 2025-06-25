import React, { useEffect, useState, useMemo, useRef } from "react";
import { projectsAPI } from "../services/api";
import { AppHeader } from "../components/AppHeader";
import { Message } from "../components/Message";
import { ModuleDeployMenu } from "../components/ModuleDeployMenu";
import axios from "axios";
import { PipelinesList } from "../components/PipelinesList";
import { StatusBadge } from "../components/StatusBadge";
import { Job } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ButtonWithLoader } from "../components/ButtonWithLoader";

interface ProjectGroup {
  id: number;
  name: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

// Config: Only show deployment-related actions (set to false to show all in future)
const SHOW_ONLY_DEPLOY_ACTIONS = true;
const DEPLOY_ACTIONS = [
  "deploy_to_qa",
  "deploy_to_develop",
  "deploy_to_staging",
  "deploy_to_production"
];
const isDeployAction = (jobName: string) =>
  !SHOW_ONLY_DEPLOY_ACTIONS || DEPLOY_ACTIONS.includes(jobName);

export const ModuleDeployPage: React.FC = () => {
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allPipelines, setAllPipelines] = useState<any[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelineJobs, setPipelineJobs] = useState<Record<number, Job[]>>({});
  const [playingJobIds, setPlayingJobIds] = useState<Set<number>>(new Set());
  const [playingGroupJob, setPlayingGroupJob] = useState<{ [groupBranchKey: string]: string | null }>({});
  const pollingIntervals = useRef<{ [pipelineId: number]: NodeJS.Timeout }>({});
  const [branchesLoading, setBranchesLoading] = useState(false);

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

  // Fetch branches for the first project in the group when group changes or branches are missing
  useEffect(() => {
    if (!selectedGroupId) return;
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || group.projectIds.length === 0) return;
    const firstProjectId = group.projectIds[0];
    const firstProject = projects.find((p) => p.id === firstProjectId);
    if (!firstProject || !firstProject.branches || firstProject.branches.length === 0) {
      setBranchesLoading(true);
      projectsAPI.getBranches(firstProjectId).then((branches) => {
        setProjects((prev) =>
          prev.map((p) => (p.id === firstProjectId ? { ...p, branches } : p))
        );
        setBranchesLoading(false);
      }).catch(() => setBranchesLoading(false));
    }
  }, [selectedGroupId, groups, projects]);

  // Fetch history on mount and after new deploy
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      await new Promise(res => setTimeout(res, 2000)); // Artificial delay for loader visibility
      const res = await axios.get("/api/bulk-deployments");
      setHistory(res.data);
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => { fetchHistory(); }, []);

  useEffect(() => {
    if (selectedGroupId !== null) {
      fetchHistory();
    }
  }, [selectedGroupId, bulkDeployBranch]);

  // Fetch all pipelines for all projects on mount and every 10 seconds
  useEffect(() => {
    let isMounted = true;
    const fetchAllPipelines = async () => {
      setPipelinesLoading(true);
      try {
        const projectsData = await projectsAPI.getAll();
        const pipelinesPromises = projectsData.map(async (project) => {
          try {
            const pipelines = await projectsAPI.getPipelines(project.id);
            return pipelines.map((pipeline) => ({
              ...pipeline,
              project_name: project.name,
              project_path: project.path_with_namespace,
              project_id: project.id,
            }));
          } catch {
            return [];
          }
        });
        const pipelinesResults = await Promise.all(pipelinesPromises);
        if (isMounted) setAllPipelines(pipelinesResults.flat());
      } finally {
        if (isMounted) setPipelinesLoading(false);
      }
    };
    fetchAllPipelines();
    const interval = setInterval(fetchAllPipelines, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Build a map from project_id to group name
  const projectIdToGroupName: Record<number, string> = useMemo(() => {
    const map: Record<number, string> = {};
    groups.forEach((group) => {
      group.projectIds.forEach((pid) => {
        map[pid] = group.name;
      });
    });
    return map;
  }, [groups]);

  // Group by date (YYYY-MM-DD), then by group/module and branch
  const groupedByDateGroupBranch = useMemo(() => {
    const byDate: Record<string, Record<string, any[]>> = {};
    allPipelines.forEach((pipeline) => {
      const date = pipeline.created_at ? new Date(pipeline.created_at).toISOString().slice(0, 10) : 'Unknown Date';
      const groupName = projectIdToGroupName[pipeline.project_id] || 'Ungrouped';
      // Only include pipelines for the selected group/module and branch
      if (!selectedGroupId || groupName !== selectedGroup?.name) {
        return;
      }
      const branch = pipeline.ref;
      // Filter by selected branch if one is selected
      if (bulkDeployBranch && branch !== bulkDeployBranch) {
        return;
      }
      const key = `${groupName}||${branch}`;
      if (!byDate[date]) byDate[date] = {};
      if (!byDate[date][key]) byDate[date][key] = [];
      byDate[date][key].push(pipeline);
    });
    return byDate;
  }, [allPipelines, projectIdToGroupName, selectedGroupId, selectedGroup, bulkDeployBranch]);

  // Replace the useEffect for polling jobs for manual/running pipelines
  useEffect(() => {
    const interval = setInterval(() => {
      // Find the latest (active) pipeline for each project
      const latestPipelineIdByProjectId: { [projectId: number]: number } = {};
      allPipelines.forEach((pipeline) => {
        const existing = latestPipelineIdByProjectId[pipeline.project_id];
        if (!existing || new Date(pipeline.created_at) > new Date(allPipelines.find(p => p.id === existing)?.created_at || 0)) {
          latestPipelineIdByProjectId[pipeline.project_id] = pipeline.id;
        }
      });
      // Only poll jobs for the latest pipeline per project that is in manual or waiting state
      const activeManualPipelines = allPipelines.filter(
        (p) => latestPipelineIdByProjectId[p.project_id] === p.id && (p.status === 'manual' || p.status === 'waiting_for_resource')
      );
      activeManualPipelines.forEach((pipeline) => {
        projectsAPI.getPipelineJobs(pipeline.project_id, pipeline.id)
          .then((jobs) => {
            setPipelineJobs((prev) => ({ ...prev, [pipeline.id]: jobs }));
          })
          .catch(() => {});
      });
    }, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [allPipelines]);

  // Add after the existing useEffect that fetches jobs for manual/running pipelines
  useEffect(() => {
    // Fetch jobs for all pipelines (including successful ones) if not already present
    allPipelines.forEach((pipeline) => {
      if (!pipelineJobs[pipeline.id]) {
        projectsAPI.getPipelineJobs(pipeline.project_id, pipeline.id)
          .then((jobs) => {
            setPipelineJobs((prev) => ({ ...prev, [pipeline.id]: jobs }));
          })
          .catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPipelines]);

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
      // 4. Only trigger pipeline for the latest (active) pipeline of each project
      await Promise.all(
        selectedGroup.projectIds.map((projectId) => {
          // Find all pipelines for this project and branch
          const projectBranchPipelines = allPipelines.filter(p => p.project_id === projectId && p.ref === bulkDeployBranch);
          if (projectBranchPipelines.length === 0) {
            // No pipeline exists for this project/branch, allow triggering
            return projectsAPI.triggerPipeline(projectId, bulkDeployBranch);
          }
          // Find the latest pipeline for this project/branch
          const latestPipeline = projectBranchPipelines.reduce((latest, p) => new Date(p.created_at) > new Date(latest.created_at) ? p : latest, projectBranchPipelines[0]);
          // Only trigger if the latest pipeline is in a terminal state
          if (["success", "failed", "canceled"].includes(latestPipeline.status)) {
            return projectsAPI.triggerPipeline(projectId, bulkDeployBranch);
          }
          // Otherwise, skip triggering for this project
          return Promise.resolve();
        })
      );
      debugger;
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
        text: "Module deployment triggered for selected module!",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Failed to trigger module deployment",
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

  // Helper to poll a job status until it is no longer pending/running/manual
  const pollJobStatus = async (projectId: number, jobId: number, pipelineId: number, maxAttempts = 10, interval = 2000) => {
    let attempts = 0;
    let job: Job | undefined;
    while (attempts < maxAttempts) {
      try {
        job = await projectsAPI.getPipelineJobs(projectId, pipelineId).then(jobs => jobs.find(j => j.id === jobId));
        if (job && !['manual', 'pending', 'running'].includes(job.status)) {
          // Terminal state reached
          setPipelineJobs(prev => ({ ...prev, [pipelineId]: prev[pipelineId]?.map(j => j.id === jobId ? job! : j) }));
          break;
        }
      } catch {}
      await new Promise(res => setTimeout(res, interval));
      attempts++;
    }
    // Always refresh jobs for this pipeline at the end
    const jobs = await projectsAPI.getPipelineJobs(projectId, pipelineId);
    setPipelineJobs(prev => ({ ...prev, [pipelineId]: jobs }));
  };

  const handlePlayJob = async (projectId: number, jobId: number, pipelineId: number) => {
    setPlayingJobIds(prev => new Set(prev).add(jobId));
    try {
      await projectsAPI.playJob(projectId, jobId);
      // Poll job status until terminal state
      await pollJobStatus(projectId, jobId, pipelineId);
    } catch (err) {
      // Optionally show error
    } finally {
      setPlayingJobIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  // Group-level manual action handler
  const handlePlayGroupManualJob = async (pipelines: any[], jobName: string, groupBranchKey: string) => {
    setPlayingGroupJob(prev => ({ ...prev, [groupBranchKey]: jobName }));
    try {
      // Find all manual jobs with this name across all pipelines in the group/branch
      const jobsToPlay: { projectId: number; jobId: number; pipelineId: number }[] = [];
      for (const pipeline of pipelines) {
        const jobs = pipelineJobs[pipeline.id] || [];
        jobs.filter(j => j.status === 'manual' && j.name === jobName).forEach(job => {
          jobsToPlay.push({ projectId: pipeline.project_id, jobId: job.id, pipelineId: pipeline.id });
        });
      }
      // Play all jobs in parallel, then poll their status
      await Promise.all(jobsToPlay.map(async ({ projectId, jobId, pipelineId }) => {
        await projectsAPI.playJob(projectId, jobId);
        await pollJobStatus(projectId, jobId, pipelineId);
      }));
      // After all jobs are played, refresh job statuses for all affected pipelines
      await Promise.all(pipelines.map(async (pipeline) => {
        const jobs = await projectsAPI.getPipelineJobs(pipeline.project_id, pipeline.id);
        setPipelineJobs(prev => ({ ...prev, [pipeline.id]: jobs }));
      }));
    } catch (err) {
      // Optionally show error
    } finally {
      setPlayingGroupJob(prev => ({ ...prev, [groupBranchKey]: null }));
    }
  };

  // Map job names to user-friendly labels
  const manualJobLabel = (jobName: string, done = false) => {
    const map: Record<string, string> = {
      deploy_to_stage: done ? 'Stage Deployed' : 'Deploy to Stage',
      deploy_to_production: done ? 'Production Deployed' : 'Deploy to Production',
      deploy_to_qa: done ? 'QA Deployed' : 'Deploy to QA',
      deploy_to_develop: done ? 'Develop Deployed' : 'Deploy to Develop',
      approve: done ? 'Approved' : 'Approve',
      build: done ? 'Built' : 'Build',
      test: done ? 'Test' : 'Test',
      // Add more mappings as needed
    };
    if (map[jobName]) return map[jobName];
    // Default: prettify (replace _ with space, capitalize words)
    let pretty = jobName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (done) {
      // If the label starts with 'Deploy to', convert to '[Target] Deployed'
      const deployMatch = pretty.match(/^Deploy to (.+)$/i);
      if (deployMatch) {
        return `${deployMatch[1]} Deployed`;
      }    
    }
    return pretty;
  };

  useEffect(() => {
    setBulkDeployBranch("");
  }, [selectedGroupId]);

  useEffect(() => {
    // Clear all previous intervals
    Object.values(pollingIntervals.current).forEach(clearInterval);
    pollingIntervals.current = {};

    // Find all running pipelines
    const runningPipelines = allPipelines.filter(p => p.status === "running");

    runningPipelines.forEach((pipeline) => {
      // Set up polling for each running pipeline
      pollingIntervals.current[pipeline.id] = setInterval(async () => {
        const updatedPipelines = await projectsAPI.getPipelines(pipeline.project_id);
        const updated = updatedPipelines.find(p => p.id === pipeline.id);
        if (updated && updated.status !== "running") {
          // Update the allPipelines state with the new status
          setAllPipelines(prev =>
            prev.map(p => p.id === updated.id ? { ...p, status: updated.status } : p)
          );
          clearInterval(pollingIntervals.current[pipeline.id]);
          delete pollingIntervals.current[pipeline.id];
        }
      }, 2000);
    });

    // Cleanup on unmount or when allPipelines changes
    return () => {
      Object.values(pollingIntervals.current).forEach(clearInterval);
      pollingIntervals.current = {};
    };
  }, [allPipelines]);

  return (
    <>
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full py-8">
        {message && (
          <Message
            type={message.type}
            message={message.text}
            onClose={() => setMessage(null)}
          />
        )}
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-bold mb-4">Module Deployment</h1>
          <div className="mb-8">
            <div className="flex gap-x-4">
              {/* Select Module */}
              <div className="flex flex-col flex-1 min-w-0">
                <label className="block text-sm font-medium mb-1 whitespace-nowrap">Select Module</label>
                <select
                  className="input w-full"
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
              {/* Module Deploy (branch dropdown) */}
              <div className="flex flex-col flex-1 min-w-0">
                <label className="block text-sm font-medium mb-1 whitespace-nowrap">Branch</label>
                <select
                  className="input w-full"
                  value={bulkDeployBranch}
                  onChange={(e) => setBulkDeployBranch(e.target.value)}
                  disabled={branchesLoading}
                >
                  <option value="">{branchesLoading ? 'Loading branches...' : 'Select branch'}</option>
                  {!branchesLoading && groupBranches.map((branch: { name: string }) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Deploy Button */}
              <div className="flex flex-col flex-1 min-w-0">
                <label className="block text-sm font-medium mb-1 opacity-0 select-none">Deploy</label>
                {(bulkDeployBranch === 'develop' || bulkDeployBranch === 'master') && (
                  <ButtonWithLoader
                    className="btn-primary w-full"
                    onClick={handleBulkDeploy}
                    loading={loading}
                    disabled={!selectedGroupId || !bulkDeployBranch}
                  >
                    Deploy to Develop
                  </ButtonWithLoader>
                )}
              </div>
            </div>
            {/* Deploy to QA Button in a new row */}
            {bulkDeployBranch.startsWith('release/') && (
              <div className="flex mt-4">
                <ButtonWithLoader
                  className="w-60 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                  onClick={handleBulkDeploy}
                  loading={loading}
                  disabled={!selectedGroupId || !bulkDeployBranch}
                >
                  Deploy to QA
                </ButtonWithLoader>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Module Deployment History */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full mt-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            Module Deployment History
            {selectedGroup && (
              <span className="text-gray-500 ml-2">
                ({selectedGroup.name}
                {bulkDeployBranch && ` - ${bulkDeployBranch}`})
              </span>
            )}
          </h2>
          {selectedGroup && (
            <div className="flex items-center gap-2">
              <select
                className="input max-w-xs text-sm"
                value={bulkDeployBranch}
                onChange={(e) => setBulkDeployBranch(e.target.value)}
              >
                <option value="">All Branches</option>
                {groupBranches.map((branch: { name: string }) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {historyLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="space-y-12">
            {!selectedGroup && (
              <div className="text-gray-500">Please select a module to view its deployment history.</div>
            )}
            {selectedGroup && Object.entries(groupedByDateGroupBranch).length === 0 && (
              <div className="text-gray-500">
                {bulkDeployBranch 
                  ? `No deployments found for branch "${bulkDeployBranch}" in this Module.`
                  : 'No deployments found for this Module.'}
              </div>
            )}
            {Object.entries(groupedByDateGroupBranch).sort((a, b) => b[0].localeCompare(a[0])).map(([date, groupBranchGroups]) => (
              <div key={date} className="mb-8">
                <div className="text-lg font-bold mb-4">{date}</div>
                <div className="space-y-8">
                  {Object.entries(groupBranchGroups).map(([key, pipelines]) => {
                    const [groupName, branch] = key.split('||');
                    const successCount = pipelines.filter(p => p.status === 'success').length;
                    const failedCount = pipelines.filter(p => p.status === 'failed').length;
                    const runningCount = pipelines.filter(p => p.status === 'running').length;
                    const total = pipelines.length;
                    const isReleaseBranch = branch.startsWith('release/');
                    return (
                      <div key={key} className="border-2 border-blue-400 rounded-lg p-4 bg-blue-50">
                        <div className="mb-2 flex items-center gap-4 flex-wrap justify-between">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-blue-700 font-semibold text-lg">{groupName}</span>
                            <span className="text-xs text-blue-500">Branch: {branch}</span>
                            <span className="text-xs text-gray-700">{successCount} Success, {failedCount} Failed, {runningCount} Running, {total} Total</span>
                          </div>
                          <div className="flex items-center gap-2 ml-auto">
                            {/* Group-level Manual Action Buttons */}
                            {(() => {
                              // Only consider the latest (active) pipeline for each project for header action button counts
                              const latestPipelineIdByProjectId: { [projectId: number]: number } = {};
                              pipelines.forEach((pipeline) => {
                                const existing = latestPipelineIdByProjectId[pipeline.project_id];
                                if (!existing || new Date(pipeline.created_at) > new Date(pipelines.find(p => p.id === existing)?.created_at || 0)) {
                                  latestPipelineIdByProjectId[pipeline.project_id] = pipeline.id;
                                }
                              });
                              const activePipelines = pipelines.filter(p => latestPipelineIdByProjectId[p.project_id] === p.id);
                              // Collect all manual jobs by name across all active pipelines in this group/branch
                              const manualJobsByName: Record<string, number> = {};
                              const successManualJobsByName: Record<string, number> = {};
                              activePipelines.forEach(pipeline => {
                                (pipelineJobs[pipeline.id] || []).forEach(job => {
                                  if (job.status === 'manual') {
                                    manualJobsByName[job.name] = (manualJobsByName[job.name] || 0) + 1;
                                  }
                                  if (job.status === 'success' && manualJobLabel(job.name, true)) {
                                    successManualJobsByName[job.name] = (successManualJobsByName[job.name] || 0) + 1;
                                  }
                                });
                              });
                              // Define allQADeployed for button enable/disable logic
                              const allQADeployed = activePipelines.every(p =>
                                pipelineJobs[p.id]?.some(j => j.status === 'success' && j.name === 'deploy_to_qa') &&
                                !pipelineJobs[p.id]?.some(j => j.status === 'manual' && j.name === 'deploy_to_qa')
                              );
                              return (
                                <>
                                  {/* Success (done) buttons first */}
                                  {Object.entries(successManualJobsByName).reverse().filter(([jobName]) => isDeployAction(jobName)).map(([jobName, count]) => (
                                    <button
                                      key={jobName + '-success'}
                                      disabled
                                      className="ml-2 px-2 py-1 bg-green-500 text-xs text-white rounded font-semibold opacity-80 cursor-not-allowed"
                                    >
                                      {manualJobLabel(jobName, true)}{count > 1 ? ` (${count})` : ''}
                                    </button>
                                  ))}
                                  {/* Pending manual action buttons after */}
                                  {Object.entries(manualJobsByName).reverse().filter(([jobName]) => isDeployAction(jobName)).map(([jobName, count]) => {
                                    // groupBranchKey is unique for each group/date/branch
                                    const groupBranchKey = `${date}__${groupName}__${branch}`;
                                    const isProcessing = playingGroupJob[groupBranchKey] === jobName;
                                    // Only enable Deploy to Stage/Production if allQADeployed is true
                                    let shouldDisable = isProcessing;
                                    if (jobName === 'deploy_to_stage') {
                                      shouldDisable = shouldDisable || !allQADeployed;
                                    }
                                    if (jobName === 'deploy_to_production') {
                                      // Only enable if all active pipelines have both QA and Stage jobs done (success) and no pending manual jobs for those names
                                      const allQAAndStageDeployed = activePipelines.every(p =>
                                        !pipelineJobs[p.id]?.some(j => j.status === 'manual' && (j.name === 'deploy_to_qa' || j.name === 'deploy_to_stage'))
                                      );
                                      shouldDisable = shouldDisable || !allQAAndStageDeployed;
                                    }
                                    return (
                                      <button
                                        key={jobName}
                                        onClick={() => handlePlayGroupManualJob(activePipelines, jobName, groupBranchKey)}
                                        disabled={shouldDisable}
                                        className={`ml-2 px-2 py-1 text-xs rounded font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${isProcessing ? 'bg-blue-400 text-white' : 'bg-yellow-500 text-black hover:bg-yellow-600'}`}
                                      >
                                        {isProcessing ? 'Executing...' : manualJobLabel(jobName, false) + (count > 1 ? ` (${count})` : '')}
                                      </button>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {/* Show all pipelines in this group, sorted by created_at descending, no project grouping */}
                           <>
                           {(() => {
                             // Find the latest pipeline id for each project
                             const latestPipelineIdByProjectId: { [projectId: number]: number } = {};
                             pipelines.forEach((pipeline) => {
                               const existing = latestPipelineIdByProjectId[pipeline.project_id];
                               if (!existing || new Date(pipeline.created_at) > new Date(pipelines.find(p => p.id === existing)?.created_at || 0)) {
                                 latestPipelineIdByProjectId[pipeline.project_id] = pipeline.id;
                               }
                             });
                             const sortedPipelines = pipelines.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                             return sortedPipelines.map((pipeline) => {
                               const isLatestForProject = pipeline.id === latestPipelineIdByProjectId[pipeline.project_id];
                               return (
                                 <div
                                   key={pipeline.id}
                                   className={`border border-gray-200 rounded p-2 flex items-center justify-between ${isLatestForProject ? 'bg-gray-50' : 'bg-gray-100 opacity-60'}`}
                                 >
                                   <div className="flex items-center gap-2">
                                     <span className="font-medium text-gray-900">{pipeline.project_name}</span>
                                     <StatusBadge status={pipeline.status} />
                                     <span className="text-xs text-gray-500">#{pipeline.iid}</span>
                                   </div>
                                   <div className="flex items-center gap-2 justify-end ml-auto">
                                     <a
                                       href={pipeline.web_url}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="text-primary-600 hover:text-primary-700 text-xs"
                                     >
                                       View Pipeline
                                     </a>
                                     {/* Manual Action Button(s) */}
                                     {isLatestForProject && (() => {
                                       // Always show success (done) buttons for deploy jobs for active pipelines
                                       const successButtons = pipelineJobs[pipeline.id]?.filter(j => j.status === 'success' && isDeployAction(j.name)).reverse().map((job) => (
                                         <button
                                           key={job.id + '-success'}
                                           disabled
                                           className={`ml-2 px-2 py-1 bg-green-500 text-white text-xs rounded font-semibold opacity-80 cursor-not-allowed`}
                                         >
                                           {manualJobLabel(job.name, true)}
                                         </button>
                                       ));
                                       // Always show pending manual action buttons for jobs with status 'manual'
                                       const qaDeployed = pipelineJobs[pipeline.id]?.some(j => j.status === 'success' && j.name === 'deploy_to_qa') &&
                                         !pipelineJobs[pipeline.id]?.some(j => j.status === 'manual' && j.name === 'deploy_to_qa');
                                       const manualButtons = pipelineJobs[pipeline.id]?.filter(j => j.status === 'manual' && isDeployAction(j.name)).reverse().map((job) => {
                                         let shouldDisable = playingJobIds.has(job.id);
                                         let buttonClass = 'bg-yellow-400 text-black hover:bg-yellow-500';
                                         if (job.name === 'deploy_to_stage' || job.name === 'deploy_to_production') {
                                           shouldDisable = shouldDisable || !qaDeployed;
                                         }
                                         if (shouldDisable && playingJobIds.has(job.id)) buttonClass = 'bg-blue-400 text-white';
                                         return (
                                           <button
                                             key={job.id}
                                             onClick={() => handlePlayJob(pipeline.project_id, job.id, pipeline.id)}
                                             disabled={shouldDisable}
                                             className={`ml-2 px-2 py-1 text-xs rounded font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${buttonClass}`}
                                           >
                                             {shouldDisable && playingJobIds.has(job.id) ? 'Executing...' : manualJobLabel(job.name, false)}
                                           </button>
                                         );
                                       });
                                       return <>{successButtons}{manualButtons}</>;
                                     })()}
                                     {/* Show Deploy to Develop status for master/develop branch if no manual job */}
                                     {(pipeline.ref === "master" || pipeline.ref === "develop") &&
                                       (!pipelineJobs[pipeline.id] || !pipelineJobs[pipeline.id].some(j => j.status === "manual" && j.name === "deploy_to_develop")) && (
                                         <button
                                           className={`ml-2 px-2 py-1 ${isLatestForProject ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'} text-xs rounded font-semibold opacity-80 cursor-not-allowed`}
                                           disabled
                                         >
                                           Deployed to Develop
                                         </button>
                                     )}
                                   </div>
                                 </div>
                               );
                             });
                           })()}
                           </>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}; 