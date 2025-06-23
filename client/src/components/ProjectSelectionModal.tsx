import React, { useState, useEffect } from "react";
import { Project } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpdateProjects: (projectIds: number[]) => void;
  selectedProjectIds: number[];
  projects: Project[];
  loading: boolean;
  projectsAssignedToOtherGroups?: Set<number>;
}

export const ProjectSelectionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onUpdateProjects,
  selectedProjectIds,
  projects,
  loading,
  projectsAssignedToOtherGroups = new Set(),
}) => {
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);

  useEffect(() => {
    setSelectedProjects(selectedProjectIds);
  }, [selectedProjectIds]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProjects(selectedProjects);
  };

  const handleProjectToggle = (projectId: number) => {
    setSelectedProjects(prev => 
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Select Projects</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="border rounded p-4 bg-gray-50">
                <ul className="space-y-2 max-h-96 overflow-y-auto">
                  {projects.map((project) => {
                    const checked = selectedProjects.includes(project.id);
                    const assignedElsewhere = projectsAssignedToOtherGroups.has(project.id) && !checked;
                    return (
                      <li key={project.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleProjectToggle(project.id)}
                          id={`modal-project-checkbox-${project.id}`}
                          className="h-4 w-4"
                          disabled={assignedElsewhere}
                        />
                        <label
                          htmlFor={`modal-project-checkbox-${project.id}`}
                          className={`flex-1 p-2 rounded ${assignedElsewhere ? 'text-gray-400 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`}
                        >
                          <div className="font-medium flex items-center gap-1">
                            {project.name}
                            {assignedElsewhere && (
                              <span className="ml-1 text-xs text-red-500 font-semibold">(Assigned to another group)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{project.path_with_namespace}</div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary px-4 py-2"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary px-4 py-2"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}; 