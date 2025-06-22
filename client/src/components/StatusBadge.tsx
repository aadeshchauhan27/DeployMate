import React from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Play,
  SkipForward,
  AlertCircle,
} from "lucide-react";

interface StatusBadgeProps {
  status:
    | "running"
    | "pending"
    | "success"
    | "failed"
    | "canceled"
    | "skipped"
    | "error"
    | "available"
    | "stopped";
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = "",
}) => {
  const statusConfig = {
    running: {
      label: "Running",
      icon: Play,
      className: "badge-info",
      iconClassName: "text-blue-600",
    },
    pending: {
      label: "Pending",
      icon: Clock,
      className: "badge-warning",
      iconClassName: "text-yellow-600",
    },
    success: {
      label: "Success",
      icon: CheckCircle,
      className: "badge-success",
      iconClassName: "text-green-600",
    },
    failed: {
      label: "Failed",
      icon: XCircle,
      className: "badge-error",
      iconClassName: "text-red-600",
    },
    canceled: {
      label: "Canceled",
      icon: XCircle,
      className: "badge-error",
      iconClassName: "text-red-600",
    },
    skipped: {
      label: "Skipped",
      icon: SkipForward,
      className: "badge-warning",
      iconClassName: "text-yellow-600",
    },
    error: {
      label: "Error",
      icon: AlertCircle,
      className: "badge-error",
      iconClassName: "text-red-600",
    },
    available: {
      label: "Available",
      icon: CheckCircle,
      className: "badge-success",
      iconClassName: "text-green-600",
    },
    stopped: {
      label: "Stopped",
      icon: XCircle,
      className: "badge-error",
      iconClassName: "text-red-600",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`${config.className} ${className} flex items-center gap-1`}
    >
      <Icon className={`w-3 h-3 ${config.iconClassName}`} />
      {config.label}
    </span>
  );
};
