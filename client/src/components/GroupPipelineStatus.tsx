import { useEffect, useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

export const GroupPipelineStatus: React.FC<{ projectIds: number[] }> = ({
  projectIds,
}) => {
  const [status, setStatus] = useState<"success" | "failed" | "loading" | null>(
    null
  );

  useEffect(() => {
    if (projectIds.length === 0) return;

    const fetchStatuses = async () => {
      setStatus("loading");
      try {
        const results = await Promise.all(
          projectIds.map((id) =>
            fetch(`http://localhost:3001/api/projects/${id}/last-pipeline`)
              .then((res) => res.json())
              .catch(() => null)
          )
        );
        const hasFailure = results.some(
          (r) => !r || r.status !== "success"
        );
        setStatus(hasFailure ? "failed" : "success");
      } catch {
        setStatus("failed");
      }
    };

    fetchStatuses();
  }, [projectIds]);

  if (status === "loading") return <LoadingSpinner />;
  if (status === "success")
    return <div className="text-green-600 font-bold">✅ All pipelines succeeded</div>;
  if (status === "failed")
    return <div className="text-red-600 font-bold">❌ One or more pipelines failed</div>;
  return null;
};
