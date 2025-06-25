import axios from "axios";
import { Project, Pipeline, Job, Environment, AuthStatus } from "../types";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

// Create axios instance with credentials
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Request interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login if unauthorized
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  getStatus: (): Promise<AuthStatus> =>
    api.get("/auth/status").then((res) => res.data),

  login: (): void => {
    window.location.href = `${API_BASE_URL}/auth/gitlab`;
  },

  logout: (): void => {
    window.location.href = `${API_BASE_URL}/auth/logout`;
  },
};

export const projectsAPI = {
  getAll: (): Promise<Project[]> =>
    api.get("/api/projects").then((res) => res.data),

  getPipelines: (projectId: number): Promise<Pipeline[]> =>
    api.get(`/api/projects/${projectId}/pipelines`).then((res) => res.data),

  getJobs: (projectId: number): Promise<Job[]> =>
    api.get(`/api/projects/${projectId}/jobs`).then((res) => res.data),

  getEnvironments: (projectId: number): Promise<Environment[]> =>
    api.get(`/api/projects/${projectId}/environments`).then((res) => res.data),

  getBranches: (projectId: number): Promise<any[]> =>
    api.get(`/api/projects/${projectId}/branches`).then((res) => res.data),

  triggerPipeline: (
    projectId: number,
    ref: string = "main",
    variables: Record<string, string> = {}
  ): Promise<Pipeline> =>
    api
      .post(`/api/projects/${projectId}/trigger-pipeline`, { ref, variables })
      .then((res) => res.data),

  stopEnvironment: (
    projectId: number,
    environmentId: number
  ): Promise<Environment> =>
    api
      .post(`/api/projects/${projectId}/environments/${environmentId}/stop`)
      .then((res) => res.data),

  getById: (projectId: number): Promise<Project> =>
    api.get(`/api/projects/${projectId}`).then((res) => res.data),

  getPipelineJobs: (projectId: number, pipelineId: number): Promise<Job[]> =>
    api.get(`/api/projects/${projectId}/pipelines/${pipelineId}/jobs`).then((res) => res.data),

  playJob: (projectId: number, jobId: number): Promise<Job> =>
    api.post(`/api/projects/${projectId}/jobs/${jobId}/play`).then((res) => res.data),
};

export async function triggerPipeline(projectId: number, branch: string, variables?: Record<string, string>) {
  const res = await fetch(`/api/projects/${projectId}/trigger-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, variables }),
  });
  if (!res.ok) throw new Error('Failed to trigger pipeline');
  return res.json();
}

export default api;
