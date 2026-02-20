import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { deriveKey, generateSalt, setEncryptionKey } from "@/lib/encryption";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Lock, Shield } from "lucide-react";

export default function SetupEncryption() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const settingsMutation = trpc.settings.updateSalt.useMutation();
  const { data: settings } = trpc.settings.get.useQuery();

  const handleSetup = async () => {
    if (!password) {
      toast.error("Please enter a password");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      let salt: string;
      
      if (settings?.saltForKeyDerivation) {
        // Use existing salt
        salt = settings.saltForKeyDerivation;
      } else {
        // Generate new salt and save to server
        salt = generateSalt();
        await settingsMutation.mutateAsync({ salt });
      }

      // Derive encryption key from password
      const key = await deriveKey(password, salt);
      setEncryptionKey(key);

      toast.success("Encryption key set successfully");
      setLocation("/dashboard");
    } catch (error) {
      console.error("Encryption setup error:", error);
      toast.error("Failed to setup encryption");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    if (!settings?.saltForKeyDerivation) {
      toast.error("No encryption salt found. Please contact support.");
      return;
    }

    setLoading(true);
    try {
      const key = await deriveKey(password, settings.saltForKeyDerivation);
      setEncryptionKey(key);
      
      toast.success("Notes unlocked");
      setLocation("/dashboard");
    } catch (error) {
      console.error("Unlock error:", error);
      toast.error("Failed to unlock notes. Check your password.");
    } finally {
      setLoading(false);
    }
  };

  const isNewUser = !settings?.saltForKeyDerivation;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
            {isNewUser ? <Shield className="w-6 h-6 text-indigo-600" /> : <Lock className="w-6 h-6 text-indigo-600" />}
          </div>
          <CardTitle className="text-2xl">
            {isNewUser ? "Setup Encryption" : "Unlock Your Notes"}
          </CardTitle>
          <CardDescription>
            {isNewUser
              ? "Create a password to encrypt your notes. This password is never stored on our servers."
              : "Enter your password to decrypt and access your notes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (isNewUser ? handleSetup() : handleUnlock())}
            />
          </div>

          {isNewUser && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              />
            </div>
          )}

          <Button
            className="w-full"
            onClick={isNewUser ? handleSetup : handleUnlock}
            disabled={loading}
          >
            {loading ? "Processing..." : isNewUser ? "Setup Encryption" : "Unlock Notes"}
          </Button>

          <div className="text-sm text-muted-foreground text-center space-y-1">
            <p>🔒 End-to-end encrypted</p>
            <p>Your password never leaves your device</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
