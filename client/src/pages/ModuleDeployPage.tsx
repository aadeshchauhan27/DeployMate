import React, { useEffect, useState, useMemo, useRef } from "react";
import { projectsAPI } from "../services/api";
import { AppHeader } from "../components/AppHeader";
import { Message } from "../components/Message";
import { ModuleDeployMenu } from "../components/ModuleDeployMenu";
import axios from "axios";
import { PipelinesList } from "../components/PipelinesList";
import { StatusBadge } from "../components/StatusBadge";
import { Job } from "../types";

interface ProjectGroup {
  id: number;
  name: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

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
  const [allPipelines, setAllPipelines] = useState<any[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelineJobs, setPipelineJobs] = useState<Record<number, Job[]>>({});
  const [playingJobIds, setPlayingJobIds] = useState<Set<number>>(new Set());
  const [playingGroupJob, setPlayingGroupJob] = useState<string | null>(null);

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

  // Fetch all pipelines for all projects on mount and every 30 seconds
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
    const interval = setInterval(fetchAllPipelines, 30000);
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
      const branch = pipeline.ref;
      const key = `${groupName}||${branch}`;
      if (!byDate[date]) byDate[date] = {};
      if (!byDate[date][key]) byDate[date][key] = [];
      byDate[date][key].push(pipeline);
    });
    return byDate;
  }, [allPipelines, projectIdToGroupName]);

  // Fetch jobs for pipelines with status 'manual' or 'waiting_for_resource'
  useEffect(() => {
    const manualPipelines = allPipelines.filter(
      (p) => p.status === 'manual' || p.status === 'waiting_for_resource'
    );
    manualPipelines.forEach((pipeline) => {
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
  const handlePlayGroupManualJob = async (pipelines: any[], jobName: string) => {
    setPlayingGroupJob(jobName);
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
    } catch (err) {
      // Optionally show error
    } finally {
      setPlayingGroupJob(null);
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
      test: done ? 'Tested' : 'Test',
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
      // Try to append 'ed' to the last word if not already
      if (!pretty.match(/ed$/i)) {
        if (pretty.match(/e$/i)) {
          pretty += 'd';
        } else {
          pretty += 'ed';
        }
      }
    }
    return pretty;
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
          <h1 className="text-2xl font-bold mb-4">Module Deployment</h1>
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
          <ModuleDeployMenu
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
      {/* Module Deployment History */}
      <div className="w-full mt-10">
        <h2 className="text-xl font-bold mb-4">Module Deployment History</h2>
        <div className="space-y-12">
          {Object.entries(groupedByDateGroupBranch).length === 0 && (
            <div className="text-gray-500">No deployments found for this Module.</div>
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
                      <div className="mb-2 flex items-center gap-4 flex-wrap">
                        <span className="text-blue-700 font-semibold text-lg">{groupName}</span>
                        <span className="text-xs text-blue-500">Branch: {branch}</span>
                        <span className="text-xs text-gray-700">{successCount} Success, {failedCount} Failed, {runningCount} Running, {total} Total</span>
                        {/* Group-level Manual Action Buttons */}
                        {(() => {
                          // Collect all manual jobs by name across all pipelines in this group/branch
                          const manualJobsByName: Record<string, number> = {};
                          const successManualJobsByName: Record<string, number> = {};
                          pipelines.forEach(pipeline => {
                            (pipelineJobs[pipeline.id] || []).forEach(job => {
                              if (job.status === 'manual') {
                                manualJobsByName[job.name] = (manualJobsByName[job.name] || 0) + 1;
                              }
                              if (job.status === 'success' && manualJobLabel(job.name, true)) {
                                successManualJobsByName[job.name] = (successManualJobsByName[job.name] || 0) + 1;
                              }
                            });
                          });
                          return (
                            <>
                              {/* Success (done) buttons first */}
                              {Object.entries(successManualJobsByName).reverse().map(([jobName, count]) => (
                                <button
                                  key={jobName + '-success'}
                                  disabled
                                  className="ml-2 px-2 py-1 bg-green-500 text-xs text-white rounded font-semibold opacity-80 cursor-not-allowed"
                                >
                                  {manualJobLabel(jobName, true)}{count > 1 ? ` (${count})` : ''}
                                </button>
                              ))}
                              {/* Pending manual action buttons after */}
                              {Object.entries(manualJobsByName).reverse().map(([jobName, count]) => {
                                const isProcessing = playingGroupJob === jobName;
                                return (
                                  <button
                                    key={jobName}
                                    onClick={() => handlePlayGroupManualJob(pipelines, jobName)}
                                    disabled={isProcessing}
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
                      <div className="space-y-2">
                        {pipelines.map((pipeline) => (
                          <div key={pipeline.id} className="border border-gray-200 rounded p-2 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{pipeline.project_name}</span>
                              <StatusBadge status={pipeline.status} />
                              <span className="text-xs text-gray-500">#{pipeline.iid}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={pipeline.web_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-600 hover:text-primary-700 text-xs"
                              >
                                View Pipeline
                              </a>
                              {/* Manual Action Button(s) */}
                              {/* Success (done) buttons first */}
                              {pipelineJobs[pipeline.id]?.filter(j => j.status === 'success').reverse().map((job) => (
                                <button
                                  key={job.id + '-success'}
                                  disabled
                                  className="ml-2 px-2 py-1 bg-green-500 text-xs text-white rounded font-semibold opacity-80 cursor-not-allowed"
                                >
                                  {manualJobLabel(job.name, true)}
                                </button>
                              ))}
                              {/* Pending manual action buttons after */}
                              {pipelineJobs[pipeline.id]?.filter(j => j.status === 'manual').reverse().map((job) => {
                                const isProcessing = playingJobIds.has(job.id);
                                return (
                                  <button
                                    key={job.id}
                                    onClick={() => handlePlayJob(pipeline.project_id, job.id, pipeline.id)}
                                    disabled={isProcessing}
                                    className={`ml-2 px-2 py-1 text-xs rounded font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${isProcessing ? 'bg-blue-400 text-white' : 'bg-yellow-400 text-black hover:bg-yellow-500'}`}
                                  >
                                    {isProcessing ? 'Executing...' : manualJobLabel(job.name, false)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}; 