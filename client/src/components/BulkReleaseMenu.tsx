import React from "react";
import { ButtonWithLoader } from "./ButtonWithLoader";

interface Props {
  releaseBranchName: string;
  setReleaseBranchName: (name: string) => void;
  onBulkRelease: () => void;
  creatingRelease: boolean;
  disabled?: boolean;
}

export const BulkReleaseMenu: React.FC<Props> = ({
  releaseBranchName,
  setReleaseBranchName,
  onBulkRelease,
  creatingRelease,
  disabled,
}) => (
  <div className="mb-4">
    <h2 className="font-semibold mb-2">Bulk Create Release Branch</h2>
    <input
      className="input mb-2"
      type="text"
      placeholder="Release branch name (e.g. 1.0.0)"
      value={releaseBranchName}
      onChange={(e) => setReleaseBranchName(e.target.value)}
    />
    <ButtonWithLoader
      className="btn-primary"
      onClick={onBulkRelease}
      loading={creatingRelease}
      disabled={disabled || !releaseBranchName.trim()}
    >
      Create Release Branch for All
    </ButtonWithLoader>
  </div>
); 