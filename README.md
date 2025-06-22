# DeployMate - GitLab Automation Tool

A modern web application for automating GitLab tasks including deployment management, job status monitoring, and more.

## Features

- 🔐 OAuth authentication with GitLab
- 🚀 Deploy projects with one click
- 📊 Real-time job status monitoring
- 🔄 Pipeline management
- 📱 Modern, responsive UI
- 🔒 Secure token management

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- GitLab account with API access

## Setup

### 1. GitLab OAuth Application Setup

1. Go to your GitLab instance (GitLab.com or self-hosted)
2. Navigate to **User Settings** > **Applications**
3. Create a new application with the following settings:
   - **Name**: DeployMate
   - **Redirect URI**: `http://localhost:3001/auth/gitlab/callback`
   - **Scopes**: `read_user`, `read_api`, `read_repository`, `write_repository`
4. Copy the **Application ID** and **Secret**

### 2. Environment Configuration

Create a `.env` file in the server directory:

```env
GITLAB_CLIENT_ID=your_gitlab_client_id
GITLAB_CLIENT_SECRET=your_gitlab_client_secret
GITLAB_REDIRECT_URI=http://localhost:3001/auth/gitlab/callback
GITLAB_URL=https://gitlab.com
SESSION_SECRET=your_session_secret
PORT=3001
```

### 3. Installation

```bash
# Install all dependencies
npm run install-all

# Start development servers
npm run dev
```

The application will be available at:

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Usage

1. **Login**: Click "Login with GitLab" to authenticate
2. **Dashboard**: View your projects and recent deployments
3. **Deploy**: Select a project and trigger deployments
4. **Monitor**: Track job status and pipeline progress
5. **Manage**: View and manage your GitLab resources

## Project Structure

```
deploymate/
├── client/          # React frontend
├── server/          # Node.js backend
├── package.json     # Root package.json
└── README.md        # This file
```

## Technologies Used

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Passport.js
- **Authentication**: GitLab OAuth 2.0
- **Database**: In-memory storage (can be extended to use a database)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
