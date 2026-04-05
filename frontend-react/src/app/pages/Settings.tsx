import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Building, Users, Bell, Sliders } from "lucide-react";

export function Settings() {
  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-slate-600 mt-2">Manage your organization settings and preferences</p>
      </div>

      <Tabs defaultValue="organization" className="space-y-6">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="organization">
            <Building className="h-4 w-4 mr-2" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Users className="h-4 w-4 mr-2" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="risk-weights">
            <Sliders className="h-4 w-4 mr-2" />
            Risk Weights
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>Manage your organization's basic information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input id="org-name" defaultValue="Acme Corporation" className="max-w-md" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-domain">Domain</Label>
                <Input id="org-domain" defaultValue="acme.com" className="max-w-md" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select defaultValue="utc">
                  <SelectTrigger id="timezone" className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="est">Eastern Time (EST)</SelectItem>
                    <SelectItem value="pst">Pacific Time (PST)</SelectItem>
                    <SelectItem value="cet">Central European Time (CET)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Role Management</CardTitle>
              <CardDescription>Configure role-based access and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">CEO</h4>
                      <p className="text-sm text-slate-600">Executive overview, top 5 risky projects only</p>
                    </div>
                    <span className="text-sm text-slate-600">3 users</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Dashboard Access</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Project Details</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Settings Access</span>
                      <Switch />
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">CTO</h4>
                      <p className="text-sm text-slate-600">Full technical drill-down access</p>
                    </div>
                    <span className="text-sm text-slate-600">5 users</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Dashboard Access</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Project Details</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Settings Access</span>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">Project Manager</h4>
                      <p className="text-sm text-slate-600">Delivery-focused view</p>
                    </div>
                    <span className="text-sm text-slate-600">12 users</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Dashboard Access</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Project Details</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Settings Access</span>
                      <Switch />
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">Developer</h4>
                      <p className="text-sm text-slate-600">Personal metrics and code alerts</p>
                    </div>
                    <span className="text-sm text-slate-600">45 users</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Dashboard Access</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Project Details</span>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Settings Access</span>
                      <Switch />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk-weights">
          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Risk Weight Configuration</CardTitle>
              <CardDescription>Adjust how different metrics contribute to overall risk scores</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Lead Time (Days)</Label>
                    <span className="text-sm font-semibold text-slate-900">30%</span>
                  </div>
                  <Slider defaultValue={[30]} max={100} step={5} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Spillover Rate</Label>
                    <span className="text-sm font-semibold text-slate-900">25%</span>
                  </div>
                  <Slider defaultValue={[25]} max={100} step={5} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Code Coverage</Label>
                    <span className="text-sm font-semibold text-slate-900">20%</span>
                  </div>
                  <Slider defaultValue={[20]} max={100} step={5} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Technical Debt</Label>
                    <span className="text-sm font-semibold text-slate-900">15%</span>
                  </div>
                  <Slider defaultValue={[15]} max={100} step={5} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Security Issues</Label>
                    <span className="text-sm font-semibold text-slate-900">10%</span>
                  </div>
                  <Slider defaultValue={[10]} max={100} step={5} />
                </div>
              </div>

              <div className="flex gap-3">
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                  Save Weights
                </Button>
                <Button variant="outline">Reset to Defaults</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Control when and how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <h4 className="font-medium text-slate-900">Critical Risk Alerts</h4>
                    <p className="text-sm text-slate-600">When project risk exceeds 70%</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <h4 className="font-medium text-slate-900">Daily Summary</h4>
                    <p className="text-sm text-slate-600">Receive daily project health digest</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <h4 className="font-medium text-slate-900">Quality Gate Failures</h4>
                    <p className="text-sm text-slate-600">Alert when quality checks fail</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div>
                    <h4 className="font-medium text-slate-900">Sprint Completion</h4>
                    <p className="text-sm text-slate-600">Summary at end of each sprint</p>
                  </div>
                  <Switch />
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <h4 className="font-medium text-slate-900">Weekly Reports</h4>
                    <p className="text-sm text-slate-600">Comprehensive weekly analytics report</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Notification Email</Label>
                <Input id="email" type="email" defaultValue="john.doe@company.com" className="max-w-md" />
              </div>

              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
