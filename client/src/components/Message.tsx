import React from "react";

interface MessageProps {
  type?: "success" | "error" | "info";
  message: string;
  onClose?: () => void;
}

const typeStyles = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const icon = {
  success: (
    <svg
      className="w-5 h-5 text-green-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  ),
  error: (
    <svg
      className="w-5 h-5 text-red-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  ),
  info: (
    <svg
      className="w-5 h-5 text-blue-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01"
      />
    </svg>
  ),
};

export const Message: React.FC<MessageProps> = ({
  type = "info",
  message,
  onClose,
}) => (
  <div
    className={`flex items-center border rounded-lg px-4 py-3 mb-4 shadow-sm ${typeStyles[type]}`}
  >
    <div className="mr-3">{icon[type]}</div>
    <div className="flex-1">{message}</div>
    {onClose && (
      <button
        onClick={onClose}
        className="ml-4 text-lg font-bold focus:outline-none"
      >
        &times;
      </button>
    )}
  </div>
);
