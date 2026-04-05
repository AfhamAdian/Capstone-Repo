import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  FolderKanban,
  Target,
  Lightbulb,
  Bell,
  Wrench,
  LogOut,
  Settings,
  TrendingUp,
  CheckSquare,
  Building,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { useUser } from "../context/UserContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUserRole, activeWorkspace } = useUser();

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    navigate("/login");
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "CEO":
        return "text-purple-600 bg-purple-50";
      case "CTO":
        return "text-blue-600 bg-blue-50";
      case "Manager":
        return "text-green-600 bg-green-50";
      case "Developer":
        return "text-orange-600 bg-orange-50";
      default:
        return "text-slate-600 bg-slate-50";
    }
  };

  const navSections = [
    {
      label: "Overview",
      items: [
        { path: "/", label: "Dashboard", icon: LayoutDashboard },
        { path: "/organization", label: "Organization", icon: Building },
      ]
    },
    {
      label: "Projects",
      items: [
        { path: "/projects", label: "All Projects", icon: FolderKanban },
        { path: "/tracked", label: "Tracked Projects", icon: Target },
        { path: "/insights", label: "Insights", icon: Lightbulb },
      ]
    },
    {
      label: "Operations",
      items: [
        { path: "/issues", label: "Issues", icon: Bell },
        { path: "/actions", label: "Action Center", icon: CheckSquare },
      ]
    },
    {
      label: "Analytics",
      items: [
        { path: "/trends", label: "Trends", icon: TrendingUp },
        { path: "/tools", label: "Tools", icon: Wrench },
      ]
    },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200/60 flex flex-col shadow-sm overflow-y-auto">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-xl font-bold text-white">PM</span>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                PMInsight
              </h1>
              <p className="text-xs text-slate-500">Intelligence Platform</p>
            </div>
          </div>

          {/* Active Workspace Badge */}
          {activeWorkspace ? (
            <button
              onClick={() => navigate("/workspaces")}
              className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-all group"
            >
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <GitBranch className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-slate-800 truncate">{activeWorkspace.name}</p>
                <p className="text-[10px] text-slate-400 capitalize">{activeWorkspace.vcs} workspace</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
            </button>
          ) : (
            <button
              onClick={() => navigate("/workspaces")}
              className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-400 hover:text-blue-600"
            >
              <GitBranch className="h-4 w-4" />
              <span className="text-xs font-medium">Select workspace</span>
            </button>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-6">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-4">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                        active
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-medium text-sm">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="mb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getRoleColor(user.role)}`}>
                      {user.role}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Switch Role</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setUserRole("CEO")}>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold mr-2 ${getRoleColor("CEO")}`}>
                    CEO
                  </span>
                  Executive View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUserRole("CTO")}>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold mr-2 ${getRoleColor("CTO")}`}>
                    CTO
                  </span>
                  Technical View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUserRole("Manager")}>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold mr-2 ${getRoleColor("Manager")}`}>
                    Manager
                  </span>
                  Team Lead View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUserRole("Developer")}>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold mr-2 ${getRoleColor("Developer")}`}>
                    Developer
                  </span>
                  Developer View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 font-semibold">
                JD
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">John Doe</p>
              <p className="text-xs text-slate-500">CTO</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0"
              onClick={() => navigate("/settings")}
            >
              <Settings className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}