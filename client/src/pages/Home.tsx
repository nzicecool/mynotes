import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Shield, Lock, Cloud, Zap, FileText, Tag, Github } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect authenticated users to setup/dashboard — must be in useEffect, not render
  useEffect(() => {
    if (!loading) {
      if (user) {
        setLocation("/setup");
      }
    }
  }, [user, loading, setLocation]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">MyNotes</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/nzicecool/mynotes"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white/60 transition-colors"
            aria-label="View MyNotes on GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
          <Button variant="outline" onClick={() => setLocation("/login")}>Sign In</Button>
          <Button onClick={() => setLocation("/register")}>Get Started</Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Your Notes,
            <br />
            <span className="text-indigo-600">Encrypted & Secure</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            A powerful note-taking app with end-to-end encryption, offline support, and real-time sync across all your devices.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="text-lg px-8" onClick={() => setLocation("/register")}>
              Get Started Free
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" onClick={() => setLocation("/login")}>
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Why Choose MyNotes?</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <FeatureCard
            icon={<Shield className="w-8 h-8 text-indigo-600" />}
            title="End-to-End Encrypted"
            description="Your notes are encrypted on your device before syncing. Only you can decrypt them with your password."
          />
          <FeatureCard
            icon={<Lock className="w-8 h-8 text-indigo-600" />}
            title="Zero-Knowledge Security"
            description="We never see your password or encryption keys. Your data is completely private."
          />
          <FeatureCard
            icon={<Cloud className="w-8 h-8 text-indigo-600" />}
            title="Offline First"
            description="Work seamlessly offline. Your notes sync automatically when you're back online."
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8 text-indigo-600" />}
            title="Real-time Sync"
            description="Changes sync instantly across all your devices with WebSocket technology."
          />
          <FeatureCard
            icon={<FileText className="w-8 h-8 text-indigo-600" />}
            title="Multiple Note Types"
            description="Plain text, rich text, Markdown, checklists, code snippets, and spreadsheets."
          />
          <FeatureCard
            icon={<Tag className="w-8 h-8 text-indigo-600" />}
            title="Powerful Organization"
            description="Tags, nested folders, smart filters, and full-text search to find anything instantly."
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to secure your notes?</h2>
          <p className="text-gray-600 mb-8">
            Join thousands of users who trust MyNotes for their private thoughts and ideas.
          </p>
          <Button size="lg" className="text-lg px-8" onClick={() => setLocation("/register")}>
            Start Taking Notes
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-gray-600">
        <div className="flex items-center justify-center gap-4 mb-2">
          <a
            href="https://github.com/nzicecool/mynotes"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors text-sm"
            aria-label="View MyNotes on GitHub"
          >
            <Github className="w-4 h-4" />
            nzicecool/mynotes
          </a>
        </div>
        <p className="text-sm">&copy; 2026 MyNotes. Your privacy is our priority.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
