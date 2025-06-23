import React, { useEffect, useState } from "react";
import { projectsAPI } from "../services/api";
import { AppHeader } from "../components/AppHeader";
import { Message } from "../components/Message";
import { GroupManagementMenu } from "../components/GroupManagementMenu";
import { Project } from "../types";
import { ProjectSelectionModal } from "../components/ProjectSelectionModal";
import { CreateGroupModal } from "../components/CreateGroupModal";

interface ProjectGroup {
  id: number;
  name: string;
  description?: string;
  projectIds: number[];
}

const GROUPS_STORAGE_URL = "http://localhost:3001/api/groups";

export const GroupManagementPage: React.FC = () => {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);

  useEffect(() => {
    // Load groups from backend
    fetch(GROUPS_STORAGE_URL)
      .then((res) => res.json())
      .then((data) => setGroups(data))
      .catch(() => setGroups([]));
    // Load all projects
    projectsAPI.getAll().then(setProjects);
  }, []);

  const handleCreateGroup = (name: string, description: string) => {
    setGroups((prevGroups) => {
      const newGroups = [
        ...prevGroups,
        {
          id: Date.now(),
          name,
          description,
          projectIds: [],
        },
      ];
      // Persist changes
      setTimeout(() => handleSaveGroups(newGroups), 0);
      return newGroups;
    });
    setIsCreateGroupModalOpen(false);
  };

  const handleSaveGroups = async (groupsToSave: ProjectGroup[]) => {
    setLoading(true);
    try {
      await fetch(GROUPS_STORAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupsToSave),
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

  // Add/remove project from selected group
  const handleProjectToggle = (projectId: number) => {
    if (selectedGroupId == null) return;
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.id !== selectedGroupId) return group;
        const isSelected = group.projectIds.includes(projectId);
        return {
          ...group,
          projectIds: isSelected
            ? group.projectIds.filter((id) => id !== projectId)
            : [...group.projectIds, projectId],
        };
      })
    );
  };

  const handleEditGroup = (groupId: number, name: string, description: string) => {
    setGroups((prevGroups) => {
      const newGroups = prevGroups.map((group) =>
        group.id === groupId ? { ...group, name, description } : group
      );
      setTimeout(() => handleSaveGroups(newGroups), 0);
      return newGroups;
    });
  };

  const handleUpdateGroupProjects = (groupId: number, projectIds: number[]) => {
    setGroups((prevGroups) => {
      const newGroups = prevGroups.map((group) => {
        if (group.id === groupId) {
          // Set the new projectIds for the selected group
          return { ...group, projectIds };
        } else {
          // Remove any project that is now in the selected group
          return {
            ...group,
            projectIds: group.projectIds.filter((pid) => !projectIds.includes(pid)),
          };
        }
      });
      setTimeout(() => handleSaveGroups(newGroups), 0);
      return newGroups;
    });
  };

  const handleUpdateGroupProjectsFromModal = (projectIds: number[]) => {
    if (selectedGroupId == null) return;
    handleUpdateGroupProjects(selectedGroupId, projectIds);
  };

  return (
    <>
      <AppHeader />
      <div className="max-w-4xl mx-auto py-8 flex gap-8">
        <div className="flex-1">
          {message && (
            <Message
              type={message.type}
              message={message.text}
              onClose={() => setMessage(null)}
            />
          )}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Module Management</h1>
          </div>
          <GroupManagementMenu
            groups={groups}
            selectedGroupId={selectedGroupId}
            loading={loading}
            onSelectGroup={setSelectedGroupId}
            onCreateGroup={handleCreateGroup}
            onEditGroup={handleEditGroup}
            onUpdateGroupProjects={handleUpdateGroupProjects}
            projects={projects}
          />
        </div>

        {/* Side panel: Projects in group */}
        {selectedGroupId && (
          <div className="w-1/3 border-l pl-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Projects in Module</h2>
            </div>
            {/* Show group description if available */}
            {groups.find(g => g.id === selectedGroupId)?.description && (
              <p className="text-sm text-gray-600 mb-4">
                {groups.find(g => g.id === selectedGroupId)?.description}
              </p>
            )}
            <ul className="space-y-2">
              {groups
                .find((g) => g.id === selectedGroupId)
                ?.projectIds.map((pid) => {
                  const project = projects.find((p) => p.id === pid);
                  if (!project) return null;
                  return (
                    <li key={project.id} className="bg-gray-100 rounded px-3 py-2">
                      {project.name}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        {/* Project Selection Modal */}
        <ProjectSelectionModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          projects={projects}
          selectedProjectIds={groups.find((g) => g.id === selectedGroupId)?.projectIds || []}
          onUpdateProjects={handleUpdateGroupProjectsFromModal}
          loading={loading}
        />

        {/* Create Group Modal */}
        <CreateGroupModal
          isOpen={isCreateGroupModalOpen}
          onClose={() => setIsCreateGroupModalOpen(false)}
          onCreateGroup={handleCreateGroup}
          loading={loading}
        />
      </div>
    </>
  );
}; 