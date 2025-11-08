import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRoles } from '@/hooks/useRoles';
import { Trash2 } from 'lucide-react';

export const RoleManagement = () => {
  const { roles, assignRole, removeRole, loading } = useRoles();
  const [newRole, setNewRole] = useState({ user_id: '', role: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.user_id || !newRole.role) return;

    await assignRole(newRole.user_id, newRole.role as 'organizer' | 'attendee');
    setNewRole({ user_id: '', role: '' });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'organizer': return 'default';
      case 'attendee': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign Role</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="User ID (UUID)"
                value={newRole.user_id}
                onChange={(e) => setNewRole({ ...newRole, user_id: e.target.value })}
                required
              />
              <Select onValueChange={(value) => setNewRole({ ...newRole, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizer">Organizer</SelectItem>
                  <SelectItem value="attendee">Attendee</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={loading}>
                {loading ? 'Assigning...' : 'Assign Role'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Role Assignments ({roles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {roles.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No role assignments found.</p>
            ) : (
              roles.map((roleAssignment) => (
                <div key={roleAssignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-medium">{roleAssignment.profiles?.display_name || roleAssignment.profiles?.email}</h3>
                    <p className="text-sm text-muted-foreground">{roleAssignment.profiles?.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Assigned: {new Date(roleAssignment.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getRoleBadgeVariant(roleAssignment.role) as any}>
                      {roleAssignment.role}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeRole(roleAssignment.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
