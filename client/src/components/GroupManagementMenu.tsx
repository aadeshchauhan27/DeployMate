import React, { useState } from "react";
import { CreateGroupModal } from "./CreateGroupModal";
import { EditGroupModal } from "./EditGroupModal";
import { ProjectSelectionModal } from "./ProjectSelectionModal";
import { ProjectsInGroupSection } from "./ProjectsInGroupSection";
import { Project } from "../types";

interface ProjectGroup {
  id: number;
  name: string;
  description?: string;
  projectIds: number[];
}

interface Props {
  groups: ProjectGroup[];
  selectedGroupId: number | null;
  onSelectGroup: (groupId: number) => void;
  onCreateGroup: (name: string, description: string) => void;
  onEditGroup: (groupId: number, name: string, description: string) => void;
  onUpdateGroupProjects: (groupId: number, projectIds: number[]) => void;
  projects: Project[];
  loading: boolean;
}

export const GroupManagementMenu: React.FC<Props> = ({
  groups,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onEditGroup,
  onUpdateGroupProjects,
  projects,
  loading
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isProjectSelectionOpen, setIsProjectSelectionOpen] = useState(false);
  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;

  // Compute projects assigned to other groups (exclude current group)
  const projectsAssignedToOtherGroups = new Set<number>();
  groups.forEach((group) => {
    if (!selectedGroup || group.id !== selectedGroup.id) {
      group.projectIds.forEach((pid) => projectsAssignedToOtherGroups.add(pid));
    }
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Modules</h2>
      </div>

      <div className="flex-grow overflow-y-auto">
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className={`p-3 rounded-lg cursor-pointer flex justify-between items-center ${
                selectedGroupId === group.id
                  ? "bg-blue-100 hover:bg-blue-200"
                  : "hover:bg-gray-100"
              }`}
              onClick={() => onSelectGroup(group.id)}
            >
              <span className="flex-grow">{group.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGroup(group.id);
                  setIsEditModalOpen(true);
                }}
                className="text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selectedGroup && (
        <div className="mt-4">
          <button
            onClick={() => setIsProjectSelectionOpen(true)}
            className="btn-secondary w-full py-2"
          >
            Modify Projects
          </button>
        </div>
      )}

      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateGroup={onCreateGroup}
        loading={loading}
      />

      <EditGroupModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onEditGroup={onEditGroup}
        group={selectedGroup}
        loading={loading}
      />

      {selectedGroup && (
        <ProjectSelectionModal
          isOpen={isProjectSelectionOpen}
          onClose={() => setIsProjectSelectionOpen(false)}
          selectedProjectIds={selectedGroup.projectIds}
          onUpdateProjects={(projectIds: number[]) => {
            onUpdateGroupProjects(selectedGroup.id, projectIds);
            setIsProjectSelectionOpen(false);
          }}
          projects={projects}
          loading={loading}
          projectsAssignedToOtherGroups={projectsAssignedToOtherGroups}
        />
      )}

      <div className="mt-6">
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary w-full py-3 text-lg rounded-lg shadow-sm"
        >
          + Create New Module
        </button>
      </div>
    </div>
  );
}; 