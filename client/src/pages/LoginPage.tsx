import React from "react";
import { Gitlab, Rocket, Zap, Shield, BarChart3 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();

  const features = [
    {
      icon: Rocket,
      title: "One-Click Deployments",
      description: "Deploy your applications with a single click",
    },
    {
      icon: BarChart3,
      title: "Real-time Monitoring",
      description: "Track pipeline and job status in real-time",
    },
    {
      icon: Zap,
      title: "Automated Workflows",
      description: "Streamline your CI/CD processes",
    },
    {
      icon: Shield,
      title: "Secure OAuth",
      description: "Secure authentication with GitLab OAuth",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-primary-600 p-3 rounded-xl mr-4">
              <Gitlab className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">DeployMate</h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Streamline your GitLab workflows with powerful automation tools for
            deployment, monitoring, and job management.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Features */}
          <div className="space-y-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="bg-primary-100 p-2 rounded-lg">
                  <feature.icon className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Login Card */}
          <div className="card max-w-md mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Get Started
              </h2>
              <p className="text-gray-600">
                Connect your GitLab account to start automating your workflows
              </p>
            </div>

            <button
              onClick={login}
              className="w-full btn-primary flex items-center justify-center space-x-2 py-3"
            >
              <Gitlab className="w-5 h-5" />
              <span>Login with GitLab</span>
            </button>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                By logging in, you agree to our terms of service and privacy
                policy
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-gray-500">
            © 2025 DeployMate. Built with ❤️ for developers.
          </p>
        </div>
      </div>
    </div>
  );
};
