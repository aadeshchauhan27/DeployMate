const express = require("express");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GitlabStrategy = require("passport-gitlab2").Strategy;
const axios = require("axios");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

const GROUPS_FILE = path.join(__dirname, "../client/public/groups.json");
const BULK_DEPLOY_HISTORY_PATH = path.join(__dirname, 'bulk_deploy_history.json');

// Middleware
app.use(helmet());
app.use(morgan("combined"));
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// In-memory storage for user sessions
const userSessions = new Map();

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = userSessions.get(id);
  done(null, user);
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
};

// GitLab OAuth Strategy
passport.use(
  new GitlabStrategy(
    {
      clientID: process.env.GITLAB_CLIENT_ID,
      clientSecret: process.env.GITLAB_CLIENT_SECRET,
      callbackURL:
        process.env.GITLAB_REDIRECT_URI ||
        "http://localhost:3001/auth/gitlab/callback",
      scope: "read_user read_api api",
      baseURL: process.env.GITLAB_BASE_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = {
          id: profile.id,
          username: profile.username,
          email: profile.emails[0].value,
          accessToken,
          refreshToken,
          profile,
        };

        userSessions.set(profile.id, user);
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Authentication routes
app.get("/auth/gitlab", passport.authenticate("gitlab"));

app.get(
  "/auth/gitlab/callback",
  passport.authenticate("gitlab", {
    failureRedirect: "http://localhost:3000?error=auth_failed",
  }),
  (req, res) => {
    res.redirect("http://localhost:3000/dashboard");
  }
);

app.get("/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.redirect("http://localhost:3000");
  });
});

// Check authentication status
app.get("/auth/status", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
      },
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Test GitLab API connectivity
app.get("/api/test-gitlab", requireAuth, async (req, res) => {
  try {
    console.log("🧪 Testing GitLab API connectivity...");
    console.log(`🔑 Access token: ${req.user.accessToken.substring(0, 10)}...`);
    console.log(`🌐 GitLab URL: ${process.env.GITLAB_BASE_URL}`);

    // Test user info
    const userResponse = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/user`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
      }
    );

    console.log("✅ User info retrieved:", userResponse.data.username);

    // Test projects access
    const projectsResponse = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
        params: {
          membership: true,
          per_page: 1,
        },
      }
    );

    console.log(
      "✅ Projects access confirmed:",
      projectsResponse.data.length,
      "projects found"
    );

    res.json({
      success: true,
      user: userResponse.data,
      projectsCount: projectsResponse.data.length,
      message: "GitLab API connectivity test successful",
    });
  } catch (error) {
    console.error(
      "❌ GitLab API test failed:",
      error.response?.data || error.message
    );

    // Check if it's a scope issue
    if (error.response?.data?.error === "insufficient_scope") {
      res.status(500).json({
        success: false,
        error: error.response?.data || error.message,
        message:
          "Insufficient OAuth scopes. Please update your GitLab OAuth app to include: read_user, read_api, read_repository, write_repository, api",
        scopeIssue: true,
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.response?.data || error.message,
        message: "GitLab API connectivity test failed",
      });
    }
  }
});

// GitLab API routes
app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    console.log("🔐 Access token:", req.user.accessToken);

    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
        params: {
          membership: true,
          per_page: 100,
          //search: "Decking",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching projects:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

app.get("/api/projects/:id/pipelines", requireAuth, async (req, res) => {
  try {
    // Fetch the list of pipelines
    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/pipelines`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
        params: {
          per_page: 20,
        },
      }
    );
    const pipelines = response.data;

    // Fetch variables for each pipeline (in parallel)
    const pipelinesWithVars = await Promise.all(
      pipelines.map(async (pipeline) => {
        try {
          const detailsRes = await axios.get(
            `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/pipelines/${pipeline.id}`,
            {
              headers: {
                Authorization: `Bearer ${req.user.accessToken}`,
              },
            }
          );
          // Attach variables (if any)
          return { ...pipeline, variables: detailsRes.data.variables || [] };
        } catch (err) {
          // If error, just return pipeline without variables
          return { ...pipeline, variables: [] };
        }
      })
    );

    res.json(pipelinesWithVars);
  } catch (error) {
    console.error(
      "Error fetching pipelines:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch pipelines" });
  }
});

// Pipeline retry endpoint
app.post(
  "/api/projects/:id/pipelines/:pipelineId/retry",
  requireAuth,
  async (req, res) => {
    try {
      const { id: projectId, pipelineId } = req.params;

      console.log(
        `🔄 Retrying pipeline ${pipelineId} for project ${projectId}`
      );
      console.log(
        `🔑 Using access token: ${req.user.accessToken.substring(0, 10)}...`
      );

      const response = await axios.post(
        `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}/pipelines/${pipelineId}/retry`,
        {},
        {
          headers: {
            Authorization: `Bearer ${req.user.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ Pipeline retry successful!`);
      console.log(`📊 New Pipeline ID: ${response.data.id}`);
      console.log(`🔗 Pipeline URL: ${response.data.web_url}`);

      res.json(response.data);
    } catch (error) {
      console.error(
        "❌ Error retrying pipeline:",
        error.response?.data || error.message
      );
      console.error("📋 Full error response:", error.response?.data);
      res.status(500).json({
        error: "Failed to retry pipeline",
        details: error.response?.data || error.message,
      });
    }
  }
);

app.get("/api/projects/:id/jobs", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/jobs`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
        params: {
          per_page: 50,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching jobs:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

app.post(
  "/api/projects/:id/trigger-pipeline",
  requireAuth,
  async (req, res) => {
    try {
      const { ref = "main", variables = {} } = req.body;
      const projectId = req.params.id;

      console.log(`🚀 Attempting to trigger pipeline for project ${projectId}`);
      console.log(`📋 Request data:`, { ref, variables });
      console.log(
        `🔑 Using access token: ${req.user.accessToken.substring(0, 10)}...`
      );

      // Validate variables
      if (typeof variables !== "object" || Array.isArray(variables)) {
        console.error("❌ Variables must be an object. Received:", variables);
        return res.status(400).json({ error: "Variables must be an object." });
      }

      // First, let's check if the project exists and get its default branch
      try {
        const projectResponse = await axios.get(
          `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}`,
          {
            headers: {
              Authorization: `Bearer ${req.user.accessToken}`,
            },
          }
        );

        const project = projectResponse.data;
        console.log(`📁 Project found: ${project.name} (${project.path})`);
        console.log(`🌿 Default branch: ${project.default_branch}`);

        // Use the project's default branch if no ref is specified
        const branchToUse = ref === "main" ? project.default_branch : ref;
        console.log(`🎯 Using branch: ${branchToUse}`);

        const response = await axios.post(
          `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}/pipeline`,
          {
            ref: branchToUse,
            variables: Object.entries(variables).map(([key, value]) => ({
              key,
              value: String(value),
            })),
          },
          {
            headers: {
              Authorization: `Bearer ${req.user.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log(`✅ Pipeline triggered successfully!`);
        console.log(`📊 Pipeline ID: ${response.data.id}`);
        console.log(`🔗 Pipeline URL: ${response.data.web_url}`);

        res.json(response.data);
      } catch (projectError) {
        console.error(
          "❌ Error fetching project details or triggering pipeline:",
          projectError.response?.data || projectError.message
        );
        res.status(500).json({
          error: "Failed to fetch project details or trigger pipeline",
          details: projectError.response?.data || projectError.message,
        });
      }
    } catch (error) {
      console.error(
        "❌ Error triggering pipeline:",
        error.response?.data || error.message
      );
      console.error("📋 Full error response:", error.response?.data);
      res.status(500).json({
        error: "Failed to trigger pipeline",
        details: error.response?.data || error.message,
      });
    }
  }
);

app.get("/api/projects/:id/environments", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/environments`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching environments:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch environments" });
  }
});

app.post(
  "/api/projects/:id/environments/:environmentId/stop",
  requireAuth,
  async (req, res) => {
    try {
      const response = await axios.post(
        `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/environments/${req.params.environmentId}/stop`,
        {},
        {
          headers: {
            Authorization: `Bearer ${req.user.accessToken}`,
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error(
        "Error stopping environment:",
        error.response?.data || error.message
      );
      res.status(500).json({ error: "Failed to stop environment" });
    }
  }
);

app.post(
  "/api/projects/:id/branches/release",
  requireAuth,
  async (req, res) => {
    try {
      const projectId = req.params.id;
      const { releaseNumber } = req.body;
      if (!releaseNumber) {
        return res.status(400).json({ error: "releaseNumber is required" });
      }
      // Fetch project to get default branch
      const projectResponse = await axios.get(
        `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${req.user.accessToken}`,
          },
        }
      );
      const project = projectResponse.data;
      const defaultBranch = project.default_branch;
      const newBranchName = `release/${releaseNumber}`;
      // Create the new branch from default branch
      const branchResponse = await axios.post(
        `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}/repository/branches`,
        null,
        {
          params: {
            branch: newBranchName,
            ref: defaultBranch,
          },
          headers: {
            Authorization: `Bearer ${req.user.accessToken}`,
          },
        }
      );

      // Copy .gitlab-ci.yml from default branch to new release branch
      try {
        // 1. Get the .gitlab-ci.yml content from the default branch
        const ciFileResponse = await axios.get(
          `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}/repository/files/.gitlab-ci.yml/raw`,
          {
            headers: {
              Authorization: `Bearer ${req.user.accessToken}`,
            },
            params: {
              ref: defaultBranch,
            },
          }
        );
        const ciFileContent = ciFileResponse.data;

        // 2. Create or update .gitlab-ci.yml in the new branch
        await axios.post(
          `${process.env.GITLAB_BASE_URL}/api/v4/projects/${projectId}/repository/files/.gitlab-ci.yml`,
          {
            branch: newBranchName,
            content: ciFileContent,
            commit_message: "Add .gitlab-ci.yml to release branch",
          },
          {
            headers: {
              Authorization: `Bearer ${req.user.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (ciError) {
        console.error(
          "Error copying .gitlab-ci.yml to release branch:",
          ciError.response?.data || ciError.message
        );
        // Optionally, you can return an error or continue
      }

      res.json({
        message: `Branch ${newBranchName} created successfully`,
        branch: branchResponse.data,
        web_url: `${project.web_url}/-/tree/${encodeURIComponent(
          newBranchName
        )}`,
      });
    } catch (error) {
      console.error(
        "Error creating release branch:",
        error.response?.data || error.message
      );
      res.status(500).json({
        error: "Failed to create release branch",
        details: error.response?.data || error.message,
      });
    }
  }
);

// Add this after other /api/projects/:id endpoints
app.get("/api/projects/:id/branches", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/repository/branches`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching branches:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.get("/api/projects/:id", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching project:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// Get groups
app.get("/api/groups", (req, res) => {
  fs.readFile(GROUPS_FILE, "utf8", (err, data) => {
    if (err) return res.json([]);
    try {
      res.json(JSON.parse(data));
    } catch {
      res.json([]);
    }
  });
});

// Save groups
app.post("/api/groups", express.json(), (req, res) => {
  fs.writeFile(GROUPS_FILE, JSON.stringify(req.body, null, 2), (err) => {
    if (err) return res.status(500).json({ error: "Failed to save groups" });
    res.json({ success: true });
  });
});

function readBulkDeployHistory() {
  try {
    if (!fs.existsSync(BULK_DEPLOY_HISTORY_PATH)) return [];
    const data = fs.readFileSync(BULK_DEPLOY_HISTORY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function writeBulkDeployHistory(history) {
  fs.writeFileSync(BULK_DEPLOY_HISTORY_PATH, JSON.stringify(history, null, 2));
}

// Endpoint to get bulk deployment history
app.get('/api/bulk-deployments', requireAuth, (req, res) => {
  const history = readBulkDeployHistory();
  res.json(history);
});

// Endpoint to record a bulk deployment
app.post('/api/bulk-deployments', requireAuth, (req, res) => {
  const { module, branch, started, environments } = req.body;
  if (!module || !branch || !started) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const history = readBulkDeployHistory();
  const record = {
    id: Date.now(),
    module,
    branch,
    started,
    environments: environments || { QA: 'idle', Stage: 'idle', Production: 'idle', Develop: 'idle' },
  };
  history.unshift(record);
  writeBulkDeployHistory(history);
  res.json({ success: true, record });
});

app.get("/api/projects/:id/pipelines/:pipeline_id/jobs", requireAuth, async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/pipelines/${req.params.pipeline_id}/jobs`,
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
        params: {
          per_page: 50,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching pipeline jobs:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to fetch pipeline jobs" });
  }
});

app.post("/api/projects/:id/jobs/:job_id/play", requireAuth, async (req, res) => {
  try {
    const response = await axios.post(
      `${process.env.GITLAB_BASE_URL}/api/v4/projects/${req.params.id}/jobs/${req.params.job_id}/play`,
      {},
      {
        headers: {
          Authorization: `Bearer ${req.user.accessToken}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Error playing manual job:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to play manual job" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 DeployMate server running on port ${PORT}`);
  console.log(
    `📝 Make sure to set up your .env file with GitLab OAuth credentials`
  );
  console.log(
    `🔗 OAuth callback URL should be: http://localhost:${PORT}/auth/gitlab/callback`
  );
  console.log(
    `⚠️  IMPORTANT: Update your GitLab OAuth app scopes to include: read_user, read_api, read_repository, write_repository, api`
  );
});
