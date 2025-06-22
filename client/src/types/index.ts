export interface User {
  id: number;
  username: string;
  email: string;
}

export interface Project {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
  avatar_url: string;
  created_at: string;
  last_activity_at: string;
  visibility: string;
  default_branch: string;
}

export interface Pipeline {
  id: number;
  iid: number;
  project_id: number;
  sha: string;
  ref: string;
  status: "running" | "pending" | "success" | "failed" | "canceled" | "skipped";
  source: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  before_sha: string;
  tag: boolean;
  yaml_errors: string | null;
  user: {
    name: string;
    username: string;
    id: number;
    state: string;
    avatar_url: string;
    web_url: string;
  };
  started_at: string | null;
  finished_at: string | null;
  committed_at: string | null;
  duration: number | null;
  queued_duration: number | null;
  coverage: string | null;
  project_name?: string;
  project_path?: string;
}

export interface Job {
  id: number;
  name: string;
  status: "running" | "pending" | "success" | "failed" | "canceled" | "skipped";
  stage: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration: number | null;
  queued_duration: number | null;
  user: {
    id: number;
    name: string;
    username: string;
    state: string;
    avatar_url: string;
    web_url: string;
  };
  commit: {
    id: string;
    short_id: string;
    created_at: string;
    parent_ids: string[];
    title: string;
    message: string;
    author_name: string;
    author_email: string;
    authored_date: string;
    committer_name: string;
    committer_email: string;
    committed_date: string;
  };
  pipeline: {
    id: number;
    ref: string;
    sha: string;
    status: string;
  };
  web_url: string;
  artifacts: any[];
  runner: any | null;
  tag_list: string[];
  ref: string;
  allow_failure: boolean;
  failure_reason: string | null;
  coverage: string | null;
}

export interface Environment {
  id: number;
  name: string;
  slug: string;
  external_url: string | null;
  created_at: string;
  updated_at: string;
  state: "available" | "stopped";
  deployable: {
    id: number;
    status: string;
    stage: string;
    name: string;
    ref: string;
    tag: boolean;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    finished_at: string | null;
    duration: number | null;
    user: {
      id: number;
      name: string;
      username: string;
      state: string;
      avatar_url: string;
      web_url: string;
    };
    commit: {
      id: string;
      short_id: string;
      created_at: string;
      parent_ids: string[];
      title: string;
      message: string;
      author_name: string;
      author_email: string;
      authored_date: string;
      committer_name: string;
      committer_email: string;
      committed_date: string;
    };
    pipeline: {
      id: number;
      ref: string;
      sha: string;
      status: string;
    };
    web_url: string;
  } | null;
}

export interface AuthStatus {
  authenticated: boolean;
  user?: User;
}
