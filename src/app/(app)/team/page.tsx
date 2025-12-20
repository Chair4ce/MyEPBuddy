"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  Users,
  UserPlus,
  Mail,
  Check,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  Clock,
  Send,
  UserCheck,
  UserX,
} from "lucide-react";
import type { Profile, TeamRequest, TeamRequestType, Rank } from "@/types/database";

// Ranks that can supervise others
const SUPERVISOR_RANKS: Rank[] = ["SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt"];

interface ChainMember extends Profile {
  depth: number;
  directSubordinates?: Profile[];
}

function canSupervise(rank: Rank | null | undefined): boolean {
  return rank !== null && rank !== undefined && SUPERVISOR_RANKS.includes(rank);
}

export default function TeamPage() {
  const { profile, subordinates, setSubordinates } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TeamRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<TeamRequest[]>([]);
  const [subordinateChain, setSubordinateChain] = useState<ChainMember[]>([]);
  
  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  // Default to "be_supervised" for junior enlisted who can't supervise
  const [inviteType, setInviteType] = useState<TeamRequestType>(
    canSupervise(profile?.rank) ? "supervise" : "be_supervised"
  );
  const [inviteMessage, setInviteMessage] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [searchedProfile, setSearchedProfile] = useState<Profile | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (profile) {
      loadTeamData();
    }
  }, [profile]);

  async function loadTeamData() {
    if (!profile) return;
    setIsLoading(true);

    try {
      // Load supervisors (people I report to)
      const { data: supervisorTeams } = await supabase
        .from("teams")
        .select("supervisor_id")
        .eq("subordinate_id", profile.id);

      if (supervisorTeams && supervisorTeams.length > 0) {
        const supervisorIds = (supervisorTeams as { supervisor_id: string }[]).map((t) => t.supervisor_id);
        const { data: supervisorProfiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", supervisorIds);
        setSupervisors((supervisorProfiles as Profile[]) || []);
      }

      // Load pending requests (where I'm the target)
      const { data: incoming } = await supabase
        .from("team_requests")
        .select(`
          *,
          requester:profiles!team_requests_requester_id_fkey(*)
        `)
        .eq("target_id", profile.id)
        .eq("status", "pending");

      setPendingRequests((incoming as TeamRequest[]) || []);

      // Load sent requests
      const { data: outgoing } = await supabase
        .from("team_requests")
        .select(`
          *,
          target:profiles!team_requests_target_id_fkey(*)
        `)
        .eq("requester_id", profile.id)
        .eq("status", "pending");

      setSentRequests((outgoing as TeamRequest[]) || []);

      // Load subordinate chain
      await loadSubordinateChain();

    } catch (error) {
      console.error("Error loading team data:", error);
      toast.error("Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSubordinateChain() {
    if (!profile) return;

    // Get chain using the database function
    const { data: chainData } = await (supabase.rpc as Function)("get_subordinate_chain", {
      supervisor_uuid: profile.id,
    }) as { data: { subordinate_id: string; depth: number }[] | null };

    if (chainData && chainData.length > 0) {
      const subordinateIds = chainData.map((c: { subordinate_id: string }) => c.subordinate_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", subordinateIds);

      if (profiles) {
        const chainMembers: ChainMember[] = profiles.map((p: Profile) => ({
          ...p,
          depth: chainData.find((c: { subordinate_id: string; depth: number }) => c.subordinate_id === p.id)?.depth || 1,
        }));
        setSubordinateChain(chainMembers.sort((a, b) => a.depth - b.depth));
      }
    }
  }

  async function searchProfile() {
    if (!inviteEmail.trim()) return;
    setIsSearching(true);
    setSearchedProfile(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", inviteEmail.trim().toLowerCase())
        .single();

      if (error || !data) {
        toast.error("No user found with that email");
      } else {
        setSearchedProfile(data as Profile);
      }
    } catch {
      toast.error("Error searching for user");
    } finally {
      setIsSearching(false);
    }
  }

  async function sendRequest() {
    if (!profile || !searchedProfile) return;
    setIsInviting(true);

    try {
      const { error } = await supabase.from("team_requests").insert({
        requester_id: profile.id,
        target_id: searchedProfile.id,
        request_type: inviteType,
        message: inviteMessage || null,
      } as never);

      if (error) {
        if (error.code === "23505") {
          toast.error("A pending request already exists");
        } else {
          throw error;
        }
      } else {
        toast.success("Request sent successfully!");
        setShowInviteDialog(false);
        setInviteEmail("");
        setInviteMessage("");
        setSearchedProfile(null);
        loadTeamData();
      }
    } catch (error) {
      console.error("Error sending request:", error);
      toast.error("Failed to send request");
    } finally {
      setIsInviting(false);
    }
  }

  async function respondToRequest(requestId: string, accept: boolean) {
    try {
      const request = pendingRequests.find((r) => r.id === requestId);
      if (!request || !profile) return;

      // Update request status
      await supabase
        .from("team_requests")
        .update({
          status: accept ? "accepted" : "declined",
          responded_at: new Date().toISOString(),
        } as never)
        .eq("id", requestId);

      // If accepted, create the team relationship
      if (accept) {
        const supervisorId = request.request_type === "supervise" 
          ? request.requester_id  // Requester wants to supervise me
          : profile.id;          // Requester wants me to supervise them
        const subordinateId = request.request_type === "supervise"
          ? profile.id           // I become the subordinate
          : request.requester_id; // Requester becomes the subordinate

        const { error: teamError } = await supabase.from("teams").insert({
          supervisor_id: supervisorId,
          subordinate_id: subordinateId,
        } as never);

        if (teamError) {
          console.error("Team insert error:", teamError);
          toast.error("Failed to create team relationship: " + teamError.message);
          return;
        }

        toast.success("Request accepted! Team relationship created.");
      } else {
        toast.success("Request declined.");
      }

      loadTeamData();
    } catch (error) {
      console.error("Error responding to request:", error);
      toast.error("Failed to respond to request");
    }
  }

  async function cancelRequest(requestId: string) {
    try {
      await supabase
        .from("team_requests")
        .delete()
        .eq("id", requestId);

      toast.success("Request cancelled");
      loadTeamData();
    } catch (error) {
      toast.error("Failed to cancel request");
    }
  }

  async function removeTeamMember(memberId: string, isSupervisor: boolean) {
    if (!profile) return;

    try {
      if (isSupervisor) {
        // Remove me from their team
        await supabase
          .from("teams")
          .delete()
          .eq("supervisor_id", memberId)
          .eq("subordinate_id", profile.id);
      } else {
        // Remove them from my team
        await supabase
          .from("teams")
          .delete()
          .eq("supervisor_id", profile.id)
          .eq("subordinate_id", memberId);
      }

      toast.success("Team member removed");
      loadTeamData();
      
      // Update store
      if (!isSupervisor) {
        setSubordinates(subordinates.filter((s) => s.id !== memberId));
      }
    } catch (error) {
      toast.error("Failed to remove team member");
    }
  }

  function getRankOrder(rank: string): number {
    const order: Record<string, number> = {
      CMSgt: 9, SMSgt: 8, MSgt: 7, TSgt: 6, SSgt: 5,
      SrA: 4, A1C: 3, Amn: 2, AB: 1,
    };
    return order[rank] || 0;
  }

  function getRequestDescription(request: TeamRequest): string {
    const requester = request.requester;
    if (request.request_type === "supervise") {
      return `${requester?.rank || ""} ${requester?.full_name || "Someone"} wants to supervise you`;
    } else {
      return `${requester?.rank || ""} ${requester?.full_name || "Someone"} wants you to supervise them`;
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Team</h1>
          <p className="text-muted-foreground">
            Manage your supervision relationships and team requests
          </p>
        </div>
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4 mr-2" />
              Send Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Team Request</DialogTitle>
              <DialogDescription>
                Request to supervise someone or request someone to supervise you
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Request Type</Label>
                <Select 
                  value={inviteType} 
                  onValueChange={(v) => {
                    setInviteType(v as TeamRequestType);
                    setSearchedProfile(null); // Reset search when type changes
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canSupervise(profile?.rank) && (
                      <SelectItem value="supervise">
                        <div className="flex items-center gap-2">
                          <ChevronDown className="size-4" />
                          I want to supervise them
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="be_supervised">
                      <div className="flex items-center gap-2">
                        <ChevronUp className="size-4" />
                        I want them to supervise me
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {!canSupervise(profile?.rank) && (
                  <p className="text-xs text-muted-foreground">
                    Only SSgt and above can supervise others
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>Search by Email</Label>
                <div className="flex gap-2">
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    type="email"
                  />
                  <Button onClick={searchProfile} disabled={isSearching}>
                    {isSearching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>

              {searchedProfile && (
                <Card className={`${
                  inviteType === "be_supervised" && !canSupervise(searchedProfile.rank)
                    ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                    : "bg-muted/50"
                }`}>
                  <CardContent className="">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {searchedProfile.full_name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {searchedProfile.rank} {searchedProfile.full_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {searchedProfile.afsc} • {searchedProfile.unit}
                        </p>
                        {inviteType === "be_supervised" && !canSupervise(searchedProfile.rank) && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            This person cannot be a supervisor (must be SSgt+)
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-auto">
                        {searchedProfile.rank}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label>Message (optional)</Label>
                <Textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Add a note to your request..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={sendRequest}
                disabled={
                  !searchedProfile || 
                  isInviting ||
                  (inviteType === "supervise" && !canSupervise(profile?.rank)) ||
                  (inviteType === "be_supervised" && !canSupervise(searchedProfile?.rank))
                }
              >
                {isInviting ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Send className="size-4 mr-2" />
                )}
                Send Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock className="size-5" />
              Pending Requests ({pendingRequests.length})
            </CardTitle>
            <CardDescription>
              Requests waiting for your response
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {request.requester?.full_name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{getRequestDescription(request)}</p>
                    {request.message && (
                      <p className="text-sm text-muted-foreground">"{request.message}"</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => respondToRequest(request.id, false)}
                  >
                    <X className="size-4 mr-1" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => respondToRequest(request.id, true)}
                  >
                    <Check className="size-4 mr-1" />
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="subordinates">
        <TabsList>
          <TabsTrigger value="subordinates" className="gap-2">
            <ChevronDown className="size-4" />
            My Subordinates ({subordinates.length})
          </TabsTrigger>
          <TabsTrigger value="supervisors" className="gap-2">
            <ChevronUp className="size-4" />
            My Supervisors ({supervisors.length})
          </TabsTrigger>
          <TabsTrigger value="chain" className="gap-2">
            <Users className="size-4" />
            Full Chain ({subordinateChain.length})
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="size-4" />
            Sent Requests ({sentRequests.length})
          </TabsTrigger>
        </TabsList>

        {/* Subordinates Tab */}
        <TabsContent value="subordinates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Direct Subordinates</CardTitle>
              <CardDescription>
                People you directly supervise
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!canSupervise(profile?.rank) ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Only SSgt and above can have subordinates.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Current rank: {profile?.rank || "Unknown"}
                  </p>
                </div>
              ) : subordinates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  You have no subordinates yet. Send a request to add team members.
                </p>
              ) : (
                <div className="space-y-3">
                  {subordinates
                    .sort((a, b) => getRankOrder(b.rank || "") - getRankOrder(a.rank || ""))
                    .map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {sub.full_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {sub.rank} {sub.full_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {sub.afsc} • {sub.unit}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{sub.role}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeTeamMember(sub.id, false)}
                          >
                            <UserX className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supervisors Tab */}
        <TabsContent value="supervisors" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>My Supervisors</CardTitle>
              <CardDescription>
                People who supervise you
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supervisors.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  You have no supervisors yet. Send a request to join a team.
                </p>
              ) : (
                <div className="space-y-3">
                  {supervisors.map((sup) => (
                    <div
                      key={sup.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {sup.full_name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {sup.rank} {sup.full_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {sup.afsc} • {sup.unit}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Supervisor</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeTeamMember(sup.id, true)}
                        >
                          <UserX className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chain Tab */}
        <TabsContent value="chain" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Full Subordinate Chain</CardTitle>
              <CardDescription>
                All members in your chain of command (including subordinates of subordinates)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!canSupervise(profile?.rank) ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Only SSgt and above can have a subordinate chain.
                  </p>
                </div>
              ) : subordinateChain.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No subordinate chain found.
                </p>
              ) : (
                <div className="space-y-2">
                  {subordinateChain.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{ marginLeft: `${(member.depth - 1) * 24}px` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {member.depth > 1 && (
                            <div className="w-4 h-px bg-border" />
                          )}
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">
                              {member.full_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {member.rank} {member.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.afsc}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Level {member.depth}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sent Requests Tab */}
        <TabsContent value="sent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sent Requests</CardTitle>
              <CardDescription>
                Requests you've sent that are pending response
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sentRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No pending sent requests.
                </p>
              ) : (
                <div className="space-y-3">
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {request.target?.full_name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {request.target?.rank} {request.target?.full_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {request.request_type === "supervise"
                              ? "You want to supervise them"
                              : "You want them to supervise you"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Sent {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => cancelRequest(request.id)}
                      >
                        <X className="size-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
