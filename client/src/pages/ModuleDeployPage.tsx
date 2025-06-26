import React, { useEffect, useState, useMemo, useRef } from "react";
import { projectsAPI, triggerPipeline } from "../services/api";
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
  const [recentlyTriggeredPipelineId, setRecentlyTriggeredPipelineId] = useState<number | null>(null);
  const [clusterSwitchPipelines, setClusterSwitchPipelines] = useState<any[]>([]);
  const [showNoDeployments, setShowNoDeployments] = useState(false);
  const [deployingEnvByGroup, setDeployingEnvByGroup] = useState<{ [groupBranchKey: string]: string | null }>({});
  const [clusterSwitchLoading, setClusterSwitchLoading] = useState(false);
  const [albChangeLoading, setAlbChangeLoading] = useState(false);

  useEffect(() => {
    fetch(GROUPS_STORAGE_URL)
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch((err) => {
        setGroups([]);
        setMessage({ type: 'error', text: 'Failed to fetch groups. ' + (typeof err === 'object' && err && 'message' in err ? (err as any).message : 'Network error.') });
      });
    projectsAPI.getAll()
      .then(setProjects)
      .catch((err) => {
        setProjects([]);
        setMessage({ type: 'error', text: 'Failed to fetch projects. ' + (typeof err === 'object' && err && 'message' in err ? (err as any).message : 'Network error.') });
      });
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
      console.log('Branch loading started for project', firstProjectId);
      let didTimeout = false;
      const timeout = setTimeout(() => {
        didTimeout = true;
        setBranchesLoading(false);
        setMessage({ type: 'error', text: 'Branch loading timed out. Please try again.' });
        console.log('Branch loading timed out for project', firstProjectId);
      }, 10000); // 10 seconds
      projectsAPI.getBranches(firstProjectId)
        .then((branches) => {
          if (!didTimeout) {
            setProjects((prev) =>
              prev.map((p) => (p.id === firstProjectId ? { ...p, branches } : p))
            );
            setBranchesLoading(false);
            clearTimeout(timeout);
            console.log('Branch loading finished for project', firstProjectId);
          }
        })
        .catch((err) => {
          if (!didTimeout) {
            setBranchesLoading(false);
            clearTimeout(timeout);
            setMessage({ type: 'error', text: 'Failed to fetch branches. ' + (typeof err === 'object' && err && 'message' in err ? (err as any).message : 'Network error.') });
            console.log('Branch loading failed for project', firstProjectId, err);
          }
        });
    }
  }, [selectedGroupId, groups, projects]);

  // Fetch history on mount and after new deploy
  const fetchHistory = async () => {
    setHistoryLoading(true);
    const start = Date.now();
    try {
      const res = await axios.get("/api/bulk-deployments");
      setHistory(res.data);
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to fetch deployment history. ' + (typeof err === 'object' && err && 'message' in err ? err.message : 'Network error.') });
    } finally {
      const elapsed = Date.now() - start;
      const minTime = 1200;
      if (elapsed < minTime) {
        setTimeout(() => setHistoryLoading(false), minTime - elapsed);
      } else {
        setHistoryLoading(false);
      }
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
        // Fetch pipelines for first 10 projects
        const initialProjects = projectsData.slice(0, 10);
        const pipelinesPromises = initialProjects.map(async (project) => {
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

        // Fetch the rest in the background
        const restProjects = projectsData.slice(10);
        if (restProjects.length > 0) {
          const restPipelinesPromises = restProjects.map(async (project) => {
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
          const restPipelinesResults = await Promise.all(restPipelinesPromises);
          if (isMounted) setAllPipelines(prev => [...prev, ...restPipelinesResults.flat()]);
        }
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
    // Special-case: add recently triggered pipeline if not already present
    if (recentlyTriggeredPipelineId) {
      const specialPipeline = allPipelines.find(p => p.id === recentlyTriggeredPipelineId);
      if (specialPipeline) {
        const date = specialPipeline.created_at ? new Date(specialPipeline.created_at).toISOString().slice(0, 10) : 'Unknown Date';
        const branch = specialPipeline.ref;
        const key = `${selectedGroup?.name}||${branch}`;
        if (!byDate[date]) byDate[date] = {};
        if (!byDate[date][key]) byDate[date][key] = [];
        if (!byDate[date][key].some(p => p.id === specialPipeline.id)) {
          byDate[date][key].unshift(specialPipeline);
        }
      }
    }
    return byDate;
  }, [allPipelines, projectIdToGroupName, selectedGroupId, selectedGroup, bulkDeployBranch, recentlyTriggeredPipelineId]);

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
    }, 1000); // 1 second
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
      const branchesResults = await Promise.all(
        selectedGroup.projectIds.map(async (projectId) => {
          try {
            const branches = await projectsAPI.getBranches(projectId);
            return { projectId, branches };
          } catch (err) {
            throw new Error('Failed to fetch branches for project ID ' + projectId + '. ' + (typeof err === 'object' && err && 'message' in err ? (err as any).message : 'Network error.'));
          }
        })
      );
      const missing = branchesResults.filter(
        (result) =>
          !result.branches.some((b: any) => b.name === bulkDeployBranch)
      );
      if (missing.length > 0) {
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
      await Promise.all(
        selectedGroup.projectIds.map(async (projectId) => {
          try {
            await projectsAPI.triggerPipeline(projectId, bulkDeployBranch);
          } catch (err) {
            throw new Error('Failed to trigger pipeline for project ID ' + projectId + '. ' + (typeof err === 'object' && err && 'message' in err ? (err as any).message : 'Network error.'));
          }
        })
      );
      await axios.post("/api/bulk-deployments", {
        module: selectedGroup.name,
        branch: bulkDeployBranch,
        started: new Date().toISOString(),
      });
      fetchHistory();
      setMessage({
        type: "success",
        text: "Module deployment triggered for selected module!",
      });
    } catch (err: any) {
      setMessage({
        type: "error",
        text: (typeof err === 'object' && err && 'message' in err) ? err.message : "Failed to trigger module deployment. Network error.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Environment deploy handler
  const handleEnvDeploy = async (env: string, groupBranchKey: string) => {
    if (!bulkDeployBranch.trim() || !selectedGroup || selectedGroup.projectIds.length === 0) return;
    setDeployingEnvByGroup(prev => ({ ...prev, [groupBranchKey]: env }));
    setEnvStatus((prev) => ({ ...prev, [env]: 'deploying' }));
    try {
      // Pass environment as a variable object
      await Promise.all(selectedGroup.projectIds.map((projectId) =>
        projectsAPI.triggerPipeline(projectId, bulkDeployBranch, { ENVIRONMENT: env })
      ));
      setEnvStatus((prev) => ({ ...prev, [env]: 'success' }));
    } catch (err) {
      setEnvStatus((prev) => ({ ...prev, [env]: 'failed' }));
    } finally {
      setDeployingEnvByGroup(prev => ({ ...prev, [groupBranchKey]: null }));
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

  // Function to trigger pipeline for Cluster Switching QA using project ID from .env
  const handleClusterSwitchQA = async () => {
    const projectId = process.env.REACT_APP_CLUSTER_SWITCH_PROJECT_ID;
    if (!projectId) {
      setMessage({ type: 'error', text: 'Cluster Switch Project ID not set in .env' });
      return;
    }
    try {
      setClusterSwitchLoading(true);
      setLoading(true);
      const pipeline = await triggerPipeline(Number(projectId), 'release/QA', { ENVIRONMENT: 'QA', ACTION: 'cluster_switch' });
      
      // Ensure pipeline has required properties for StatusBadge
      if (!pipeline || typeof pipeline !== 'object') {
        throw new Error('Invalid pipeline response');
      }
      
      // Add missing properties if they don't exist
      const normalizedPipeline = {
        ...pipeline,
        id: pipeline.id || pipeline.iid || Date.now(),
        project_id: pipeline.project_id || Number(projectId),
        status: pipeline.status || 'pending',
        ref: pipeline.ref || 'release/QA',
        created_at: pipeline.created_at || new Date().toISOString(),
        project_name: pipeline.project_name || `Cluster Switch Project ${projectId}`,
        web_url: pipeline.web_url || '#'
      };
      
      setAllPipelines(prev => [normalizedPipeline, ...prev]);
      setClusterSwitchPipelines(prev => [normalizedPipeline, ...prev]);
      
      try {
        const jobs = await projectsAPI.getPipelineJobs(normalizedPipeline.project_id, normalizedPipeline.id);
        setPipelineJobs(prev => ({ ...prev, [normalizedPipeline.id]: jobs }));
      } catch (jobError) {
        console.warn('Failed to fetch pipeline jobs:', jobError);
        // Set empty jobs array as fallback
        setPipelineJobs(prev => ({ ...prev, [normalizedPipeline.id]: [] }));
      }
      
      setRecentlyTriggeredPipelineId(normalizedPipeline.id);
      setMessage({ type: 'success', text: 'Cluster Switching QA pipeline triggered!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to trigger Cluster Switching QA pipeline' });
    } finally {
      setLoading(false);
      setClusterSwitchLoading(false);
    }
  };

  // Function to trigger pipeline for Change ALB using project ID from .env
  const handleChangeALB = async () => {
    const projectId = process.env.REACT_APP_ALB_CHANGE_PROJECT_ID;
    if (!projectId) {
      setMessage({ type: 'error', text: 'ALB Change Project ID not set in .env' });
      return;
    }
    try {
      setAlbChangeLoading(true);
      setLoading(true);
      const pipeline = await triggerPipeline(Number(projectId), 'release/QA', { ENVIRONMENT: 'QA', ACTION: 'change_alb' });
      
      // Ensure pipeline has required properties for StatusBadge
      if (!pipeline || typeof pipeline !== 'object') {
        throw new Error('Invalid pipeline response');
      }
      
      // Add missing properties if they don't exist
      const normalizedPipeline = {
        ...pipeline,
        id: pipeline.id || pipeline.iid || Date.now(),
        project_id: pipeline.project_id || Number(projectId),
        status: pipeline.status || 'pending',
        ref: pipeline.ref || 'release/QA',
        created_at: pipeline.created_at || new Date().toISOString(),
        project_name: pipeline.project_name || `ALB Change Project ${projectId}`,
        web_url: pipeline.web_url || '#'
      };
      
      setAllPipelines(prev => [normalizedPipeline, ...prev]);
      setClusterSwitchPipelines(prev => [normalizedPipeline, ...prev]);
      
      try {
        const jobs = await projectsAPI.getPipelineJobs(normalizedPipeline.project_id, normalizedPipeline.id);
        setPipelineJobs(prev => ({ ...prev, [normalizedPipeline.id]: jobs }));
      } catch (jobError) {
        console.warn('Failed to fetch pipeline jobs:', jobError);
        // Set empty jobs array as fallback
        setPipelineJobs(prev => ({ ...prev, [normalizedPipeline.id]: [] }));
      }
      
      setRecentlyTriggeredPipelineId(normalizedPipeline.id);
      setMessage({ type: 'success', text: 'Change ALB pipeline triggered!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to trigger Change ALB pipeline' });
    } finally {
      setLoading(false);
      setAlbChangeLoading(false);
    }
  };

  const handleGroupEnvAction = async (action: 'cluster' | 'alb') => {
    if (action === 'alb') {
      setAlbChangeLoading(true);
    }
    const newPipelines: any[] = [];
    for (const pipeline of allPipelines) {
      try {
        const newPipeline = await projectsAPI.triggerPipeline(pipeline.project_id, pipeline.ref, {
          ENVIRONMENT: 'QA', // or dynamically determine env if needed
          ACTION: action === 'cluster' ? 'cluster_switch' : 'change_alb',
        });
        
        // Ensure pipeline has required properties for StatusBadge
        if (!newPipeline || typeof newPipeline !== 'object') {
          console.warn('Invalid pipeline response for project', pipeline.project_id);
          continue;
        }
        
        // Add missing properties if they don't exist
        const normalizedPipeline = {
          ...newPipeline,
          id: newPipeline.id || newPipeline.iid || Date.now(),
          project_id: newPipeline.project_id || pipeline.project_id,
          status: newPipeline.status || 'pending',
          ref: newPipeline.ref || pipeline.ref,
          created_at: newPipeline.created_at || new Date().toISOString(),
          project_name: newPipeline.project_name || pipeline.project_name,
          web_url: newPipeline.web_url || '#'
        };
        
        newPipelines.push(normalizedPipeline);
        setAllPipelines(prev => [normalizedPipeline, ...prev]);
        
        try {
          const jobs = await projectsAPI.getPipelineJobs(normalizedPipeline.project_id, normalizedPipeline.id);
          setPipelineJobs(prev => ({ ...prev, [normalizedPipeline.id]: jobs }));
        } catch (jobError) {
          console.warn('Failed to fetch pipeline jobs for', normalizedPipeline.id, jobError);
          // Set empty jobs array as fallback
          setPipelineJobs(prev => ({ ...prev, [normalizedPipeline.id]: [] }));
        }
      } catch (error) {
        console.error('Failed to trigger pipeline for project', pipeline.project_id, error);
      }
    }
    setClusterSwitchPipelines(prev => [...newPipelines, ...prev]);
    if (action === 'alb') {
      setAlbChangeLoading(false);
    }
  };

  useEffect(() => {
    if (!historyLoading && selectedGroup && Object.entries(groupedByDateGroupBranch).length === 0) {
      setShowNoDeployments(false);
      const timeout = setTimeout(() => setShowNoDeployments(true), 1500);
      return () => clearTimeout(timeout);
    } else {
      setShowNoDeployments(false);
    }
  }, [historyLoading, selectedGroup, groupedByDateGroupBranch]);

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
          {selectedGroup && (() => {
            // Find latest pipeline for each project in the group and branch
            const latestPipelineIdByProjectId: { [projectId: number]: number } = {};
            allPipelines.forEach((pipeline) => {
              if (
                projectIdToGroupName[pipeline.project_id] === selectedGroup.name &&
                (!bulkDeployBranch || pipeline.ref === bulkDeployBranch)
              ) {
                const existing = latestPipelineIdByProjectId[pipeline.project_id];
                if (
                  !existing ||
                  new Date(pipeline.created_at) > new Date(allPipelines.find(p => p.id === existing)?.created_at || 0)
                ) {
                  latestPipelineIdByProjectId[pipeline.project_id] = pipeline.id;
                }
              }
            });
            const activePipelines = Object.values(latestPipelineIdByProjectId).map(id =>
              allPipelines.find(p => p.id === id)
            ).filter(Boolean);

            const allQADeployed = activePipelines.length > 0 && activePipelines.every(p =>
              pipelineJobs[p.id]?.some(j => j.status === "success" && j.name === "deploy_to_qa") &&
              !pipelineJobs[p.id]?.some(j => j.status === "manual" && j.name === "deploy_to_qa")
            );
            const allStageDeployed = activePipelines.length > 0 && activePipelines.every(p =>
              pipelineJobs[p.id]?.some(j => j.status === "success" && j.name === "deploy_to_staging") &&
              !pipelineJobs[p.id]?.some(j => j.status === "manual" && j.name === "deploy_to_staging")
            );
            const allProdDeployed = activePipelines.length > 0 && activePipelines.every(p =>
              pipelineJobs[p.id]?.some(j => j.status === "success" && j.name === "deploy_to_production") &&
              !pipelineJobs[p.id]?.some(j => j.status === "manual" && j.name === "deploy_to_production")
            );
            // Count how many pipelines passed each stage
            const qaPassedCount = activePipelines.filter(p => pipelineJobs[p.id]?.some(j => j.status === "success" && j.name === "deploy_to_qa")).length;
            const stagePassedCount = activePipelines.filter(p => pipelineJobs[p.id]?.some(j => j.status === "success" && j.name === "deploy_to_staging")).length;
            const prodPassedCount = activePipelines.filter(p => pipelineJobs[p.id]?.some(j => j.status === "success" && j.name === "deploy_to_production")).length;
            return (
              <>
                
              </>
            );
          })()}
        </div>
        {/* Separator below header */}
        <div className="border-b border-gray-300 mb-4" />
        {historyLoading ? (
          <div className="space-y-8 py-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50 animate-pulse">
                <div className="mb-2 flex items-center gap-4 flex-wrap justify-between">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="h-6 w-40 bg-gray-200 rounded" />
                    <div className="h-4 w-24 bg-gray-200 rounded" />
                    <div className="h-4 w-32 bg-gray-200 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-32 bg-gray-200 rounded" />
                    <div className="h-8 w-32 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="space-y-2 mt-4">
                  {[1, 2].map((j) => (
                    <div key={j} className="border border-gray-200 rounded p-2 flex items-center justify-between bg-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-24 bg-gray-200 rounded" />
                        <div className="h-4 w-12 bg-gray-200 rounded" />
                        <div className="h-4 w-10 bg-gray-200 rounded" />
                      </div>
                      <div className="flex items-center gap-2 justify-end ml-auto">
                        <div className="h-4 w-20 bg-gray-200 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-12">
            {!selectedGroup && (
              <div className="text-gray-500">Please select a module to view its deployment history.</div>
            )}
            {selectedGroup && Object.entries(groupedByDateGroupBranch).length === 0 && !showNoDeployments && (
              <div className="space-y-8 py-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50 animate-pulse">
                    <div className="mb-2 flex items-center gap-4 flex-wrap justify-between">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="h-6 w-40 bg-gray-200 rounded" />
                        <div className="h-4 w-24 bg-gray-200 rounded" />
                        <div className="h-4 w-32 bg-gray-200 rounded" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-32 bg-gray-200 rounded" />
                        <div className="h-8 w-32 bg-gray-200 rounded" />
                      </div>
                    </div>
                    <div className="space-y-2 mt-4">
                      {[1, 2].map((j) => (
                        <div key={j} className="border border-gray-200 rounded p-2 flex items-center justify-between bg-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-24 bg-gray-200 rounded" />
                            <div className="h-4 w-12 bg-gray-200 rounded" />
                            <div className="h-4 w-10 bg-gray-200 rounded" />
                          </div>
                          <div className="flex items-center gap-2 justify-end ml-auto">
                            <div className="h-4 w-20 bg-gray-200 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedGroup && Object.entries(groupedByDateGroupBranch).length === 0 && showNoDeployments && (
              <div className="text-gray-500">
                {bulkDeployBranch 
                  ? `No deployments found for branch "${bulkDeployBranch}" in this Module.`
                  : 'No deployments found for this Module.'}
              </div>
            )}
            {selectedGroup && Object.entries(groupedByDateGroupBranch).sort((a, b) => b[0].localeCompare(a[0])).map(([date, groupBranchGroups]) => (
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
                    const activePipelines = pipelines.filter(p => p.status === 'running');
                    const handleGroupEnvAction = async (action: 'cluster' | 'alb') => {
                      for (const pipeline of activePipelines) {
                        await projectsAPI.triggerPipeline(pipeline.project_id, pipeline.ref, {
                          ENVIRONMENT: 'QA', // or dynamically determine env if needed
                          ACTION: action === 'cluster' ? 'cluster_switch' : 'change_alb',
                        });
                      }
                      fetchHistory();
                    };
                    const allQADeployed = activePipelines.length > 0 && activePipelines.every((p: any) =>
                      (pipelineJobs[p.id] || []).some((j: any) => j.status === 'success' && j.name === 'deploy_to_qa') &&
                      !(pipelineJobs[p.id] || []).some((j: any) => j.status === 'manual' && j.name === 'deploy_to_qa')
                    );
                    return (
                      <div key={key} className="border-2 border-blue-400 rounded-lg p-4 bg-blue-50">
                        <div className="mb-2 flex items-center gap-4 flex-wrap justify-between">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="text-blue-700 font-semibold text-lg">{groupName}</span>
                            <span className="text-xs text-blue-500">Branch: {branch}</span>
                            <span className="text-xs text-gray-700">{successCount} Success, {failedCount} Failed, {runningCount} Running, {total} Total</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Group-level Manual Action Buttons removed as requested. */}
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
                                     {pipeline.status && ['running', 'pending', 'success', 'failed', 'canceled', 'skipped', 'error', 'available', 'stopped', 'manual'].includes(pipeline.status) ? (
                                       <StatusBadge status={pipeline.status} />
                                     ) : (
                                       <span className="text-red-500 text-sm">Invalid status: {pipeline.status || 'undefined'}</span>
                                     )}
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
                                     {/* Manual Action Buttons hidden for individual project pipelines as requested */}
                                   </div>
                                 </div>
                               );
                             });
                           })()}
                           </>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          {/* Left: Deploy environment buttons */}
                          <div className="flex gap-2">
                            {(['qa', 'staging', 'production'] as const).map((env) => {
                              const jobName = env === 'qa' ? 'deploy_to_qa' : env === 'staging' ? 'deploy_to_staging' : 'deploy_to_production';
                              const latestPipelineIdByProjectId: Record<number, number> = {};
                              pipelines.forEach((pipeline: any) => {
                                const existing = latestPipelineIdByProjectId[pipeline.project_id];
                                if (!existing || new Date(pipeline.created_at) > new Date(pipelines.find((p: any) => p.id === existing)?.created_at || 0)) {
                                  latestPipelineIdByProjectId[pipeline.project_id] = pipeline.id;
                                }
                              });
                              const activePipelines: any[] = pipelines.filter((p: any) => latestPipelineIdByProjectId[p.project_id] === p.id);
                              const hasManual = activePipelines.some((p: any) => (pipelineJobs[p.id] || []).some((j: any) => j.name === jobName && j.status === 'manual'));
                              const isRunning = activePipelines.some((p: any) => (pipelineJobs[p.id] || []).some((j: any) => j.name === jobName && j.status === 'running'));
                              const isSuccess = activePipelines.length > 0 && activePipelines.every((p: any) => (pipelineJobs[p.id] || []).some((j: any) => j.name === jobName && j.status === 'success'));
                              let colorClass = '';
                              if (isSuccess) {
                                colorClass = 'bg-green-500 text-white';
                              } else if (hasManual) {
                                colorClass = 'bg-yellow-400 text-black hover:bg-yellow-500';
                              } else {
                                colorClass = 'bg-gray-200 text-gray-500 cursor-not-allowed';
                              }
                              const groupBranchKey = `${date}__${groupName}__${branch}`;
                              const isDeploying = deployingEnvByGroup[groupBranchKey] === env;
                              return (
                                <button
                                  key={env}
                                  className={`px-4 py-1 rounded font-bold text-xs transition ${colorClass} ${(isRunning || isDeploying) ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  disabled={!hasManual || isRunning || isSuccess || isDeploying}
                                  onClick={() => {
                                    if (!hasManual || isRunning || isSuccess || isDeploying) return;
                                    setDeployingEnvByGroup(prev => ({ ...prev, [groupBranchKey]: env }));
                                    handlePlayGroupManualJob(activePipelines, jobName, groupBranchKey)
                                      .finally(() => setDeployingEnvByGroup(prev => ({ ...prev, [groupBranchKey]: null })));
                                  }}
                                >
                                  {env === 'qa' ? 'QA' : env === 'staging' ? 'STAGING' : 'PRODUCTION'}
                                </button>
                              );
                            })}
                          </div>
                          {/* Right: Cluster Switching and Change ALB buttons */}
                          <div className="flex gap-2 ml-auto">
                            {(() => {
                              const latestPipelineIdByProjectId: Record<number, number> = {};
                              pipelines.forEach((pipeline: any) => {
                                const existing = latestPipelineIdByProjectId[pipeline.project_id];
                                if (!existing || new Date(pipeline.created_at) > new Date(pipelines.find((p: any) => p.id === existing)?.created_at || 0)) {
                                  latestPipelineIdByProjectId[pipeline.project_id] = pipeline.id;
                                }
                              });
                              const activePipelines: any[] = pipelines.filter((p: any) => latestPipelineIdByProjectId[p.project_id] === p.id);
                              const isQAGreen = activePipelines.length > 0 && activePipelines.every((p: any) => (pipelineJobs[p.id] || []).some((j: any) => j.name === 'deploy_to_qa' && j.status === 'success'));
                              const isStagingGreen = isQAGreen && activePipelines.every((p: any) => (pipelineJobs[p.id] || []).some((j: any) => j.name === 'deploy_to_staging' && j.status === 'success'));
                              const isProductionGreen = isStagingGreen && activePipelines.every((p: any) => (pipelineJobs[p.id] || []).some((j: any) => j.name === 'deploy_to_production' && j.status === 'success'));
                              let env = '';
                              if (isProductionGreen) env = 'PRODUCTION';
                              else if (isStagingGreen) env = 'STAGING';
                              else if (isQAGreen) env = 'QA';
                              const enabled = !!env;
                              const blueClass = enabled && !clusterSwitchLoading ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed';
                              const purpleClass = enabled && !albChangeLoading ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed';
                              return <>
                                <ButtonWithLoader
                                  className={`font-bold py-1 px-3 rounded text-xs transition ${blueClass}`}
                                  onClick={handleClusterSwitchQA}
                                  disabled={!enabled || clusterSwitchLoading}
                                  loading={clusterSwitchLoading}
                                >
                                  {clusterSwitchLoading ? 'Cluster Switching...' : `Cluster Switching ${env}`}
                                </ButtonWithLoader>
                                <ButtonWithLoader
                                  className={`font-bold py-1 px-3 rounded text-xs transition ${purpleClass}`}
                                  onClick={handleChangeALB}
                                  disabled={!enabled || albChangeLoading}
                                  loading={albChangeLoading}
                                >
                                  {albChangeLoading ? 'Change ALB...' : `Change ALB ${env}`}
                                </ButtonWithLoader>
                              </>;
                            })()}
                          </div>
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