import React from "react";

interface ButtonWithLoaderProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
}

const AnimatedDots: React.FC = () => (
  <span className="inline-block" aria-label="Loading">
    <span
      className="dot bg-current inline-block w-2 h-2 rounded-full mx-0.5 animate-bounce"
      style={{ animationDelay: "0s" }}
    ></span>
    <span
      className="dot bg-current inline-block w-2 h-2 rounded-full mx-0.5 animate-bounce"
      style={{ animationDelay: "0.15s" }}
    ></span>
    <span
      className="dot bg-current inline-block w-2 h-2 rounded-full mx-0.5 animate-bounce"
      style={{ animationDelay: "0.3s" }}
    ></span>
  </span>
);

export const ButtonWithLoader: React.FC<ButtonWithLoaderProps> = ({
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}) => (
  <button
    className={`relative flex items-center justify-center ${className}`}
    disabled={loading || disabled}
    {...props}
  >
    {/* Hide text when loading, show spinner centered */}
    <span className={loading ? "invisible" : ""}>{children}</span>
    {loading && (
      <span className="absolute inset-0 flex items-center justify-center">
        <AnimatedDots />
      </span>
    )}
  </button>
);

// Add the following to your global CSS (e.g., index.css or tailwind config):
// .animate-bounce { animation: bounce 1s infinite alternate; }
// @keyframes bounce { 0% { transform: translateY(0); } 100% { transform: translateY(-0.5rem); } }
