import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Plus, Save, ArrowLeft, Users, Settings, Key } from "lucide-react";

interface User {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [newSetting, setNewSetting] = useState({ key: "", value: "", description: "" });

  useEffect(() => {
    if (!user || (user.role !== "superadmin" && user.role !== "admin")) {
      setLocation("/");
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        fetch("/api/auth/users", { credentials: "include" }),
        fetch("/api/auth/settings", { credentials: "include" }),
      ]);
      
      if (usersRes.ok) setUsers(await usersRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (error) {
      toast({ title: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest("POST", "/api/auth/users", newUser);
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "User created successfully" });
      setNewUser({ username: "", password: "", role: "user" });
      fetchData();
    } catch (error) {
      toast({ title: "Failed to create user", description: error instanceof Error ? error.message : "", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await apiRequest("DELETE", `/api/auth/users/${id}`);
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "User deleted" });
      fetchData();
    } catch (error) {
      toast({ title: "Failed to delete user", description: error instanceof Error ? error.message : "", variant: "destructive" });
    }
  };

  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest("POST", "/api/auth/settings", newSetting);
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Setting saved" });
      setNewSetting({ key: "", value: "", description: "" });
      fetchData();
    } catch (error) {
      toast({ title: "Failed to save setting", description: error instanceof Error ? error.message : "", variant: "destructive" });
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!confirm("Are you sure you want to delete this setting?")) return;
    try {
      const res = await apiRequest("DELETE", `/api/auth/settings/${key}`);
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Setting deleted" });
      fetchData();
    } catch (error) {
      toast({ title: "Failed to delete setting", description: error instanceof Error ? error.message : "", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to App
            </Button>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Logged in as <span className="text-white font-medium">{user?.username}</span>
              <span className="ml-2 px-2 py-1 text-xs rounded bg-blue-600 text-white">{user?.role}</span>
            </span>
            <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
              Logout
            </Button>
          </div>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="users" className="data-[state=active]:bg-slate-700">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-slate-700">
              <Settings className="w-4 h-4 mr-2" />
              API Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Create New User
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="flex gap-4 items-end flex-wrap">
                  <div className="space-y-2">
                    <Label htmlFor="new-username">Username</Label>
                    <Input
                      id="new-username"
                      data-testid="input-new-username"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      placeholder="Username"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password</Label>
                    <Input
                      id="new-password"
                      data-testid="input-new-password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={newUser.role}
                      onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                    >
                      <SelectTrigger className="w-32" data-testid="select-new-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {user?.role === "superadmin" && (
                          <SelectItem value="superadmin">Superadmin</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" data-testid="button-create-user">
                    <Plus className="w-4 h-4 mr-2" />
                    Create User
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User List</CardTitle>
                <CardDescription>Manage user accounts and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-slate-800"
                      data-testid={`user-row-${u.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-medium">{u.username}</span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          u.role === "superadmin" ? "bg-red-600 text-white" :
                          u.role === "admin" ? "bg-blue-600 text-white" :
                          "bg-slate-600 text-white"
                        }`}>
                          {u.role}
                        </span>
                      </div>
                      {user?.role === "superadmin" && u.username !== "adhielesmana" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteUser(u.id)}
                          data-testid={`button-delete-user-${u.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  Add/Update Setting
                </CardTitle>
                <CardDescription>
                  Store API keys and configuration values. Common keys: OPENAI_API_KEY, PEXELS_API_KEY
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSetting} className="flex gap-4 items-end flex-wrap">
                  <div className="space-y-2">
                    <Label htmlFor="setting-key">Key</Label>
                    <Input
                      id="setting-key"
                      data-testid="input-setting-key"
                      value={newSetting.key}
                      onChange={(e) => setNewSetting({ ...newSetting, key: e.target.value })}
                      placeholder="OPENAI_API_KEY"
                      required
                    />
                  </div>
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <Label htmlFor="setting-value">Value</Label>
                    <Input
                      id="setting-value"
                      data-testid="input-setting-value"
                      value={newSetting.value}
                      onChange={(e) => setNewSetting({ ...newSetting, value: e.target.value })}
                      placeholder="sk-..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setting-description">Description (optional)</Label>
                    <Input
                      id="setting-description"
                      data-testid="input-setting-description"
                      value={newSetting.description}
                      onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                      placeholder="OpenAI API key for video generation"
                    />
                  </div>
                  <Button type="submit" data-testid="button-save-setting">
                    <Save className="w-4 h-4 mr-2" />
                    Save Setting
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Settings</CardTitle>
                <CardDescription>View and manage application settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {settings.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">No settings configured yet</p>
                  ) : (
                    settings.map((s) => (
                      <div
                        key={s.key}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-slate-800"
                        data-testid={`setting-row-${s.key}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{s.key}</span>
                            {s.description && (
                              <span className="text-xs text-slate-500">- {s.description}</span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 font-mono truncate max-w-md">
                            {s.key.includes("KEY") || s.key.includes("SECRET") 
                              ? `${s.value.substring(0, 8)}...${s.value.substring(s.value.length - 4)}`
                              : s.value
                            }
                          </div>
                        </div>
                        {user?.role === "superadmin" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteSetting(s.key)}
                            data-testid={`button-delete-setting-${s.key}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
