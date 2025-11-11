import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceManager } from "@/components/resource-management/ResourceManager";
import { AllocationManager } from "@/components/resource-management/AllocationManager";
import { CheckInSystem } from "@/components/resource-management/CheckInSystem";
import { ReportsManager } from "@/components/resource-management/ReportsManager";
import { ResourceDashboard } from "@/components/resource-management/ResourceDashboard";
import { MapPin, Users, QrCode, BarChart3, Settings, Home } from "lucide-react";

const ResourceManagement = () => {
  const [activeTab, setActiveTab] = React.useState("dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-4xl font-bold">
            Resource Management
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Manage resources, allocations and generate detailed reports
          </p>
        </div>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
  <TabsList className="flex w-full justify-center max-w-5xl mx-auto gap-6">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="resources" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Resource Catalog
            </TabsTrigger>
            {/* Allocations tab removed per request 
            <TabsTrigger value="checkin" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Check-In
            </TabsTrigger>*/}
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <ResourceDashboard onNavigate={setActiveTab} />
          </TabsContent>

          <TabsContent value="resources" className="space-y-6">
            <ResourceManager />
          </TabsContent>

          {/* Allocations tab content removed */}

          <TabsContent value="checkin" className="space-y-6">
            <CheckInSystem />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <ReportsManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ResourceManagement;
