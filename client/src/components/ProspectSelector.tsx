import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search, User, Building2, MapPin, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProspectSelectorProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
}

export function ProspectSelector({ 
  selectedIds, 
  onToggle, 
  onSelectAll, 
  onClear 
}: ProspectSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/prospects", { limit: 1000 }],
  });

  const prospects = (data as any)?.prospects || [];
  
  const currentSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

  const filteredProspects = prospects.filter((prospect: any) =>
    [prospect.firstName, prospect.lastName, prospect.email, prospect.company, prospect.jobTitle]
      .filter(Boolean)
      .some(field => field.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelectAll = () => {
    onSelectAll(filteredProspects.map((p: any) => p.id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (prospects.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <p>No prospects found in your database.</p>
        <p className="text-sm mt-2">Import prospects from Apollo.io first.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search prospects by name, email, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-prospects"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          data-testid="button-select-all"
        >
          Select All
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          data-testid="button-clear-all"
        >
          Clear
        </Button>
      </div>

      <div className="text-sm text-muted-foreground" data-testid="text-selection-count">
        {currentSelectedIds.length} of {filteredProspects.length} prospects selected
      </div>

      <ScrollArea className="h-[400px] rounded-md border">
        <div className="p-4 space-y-2">
          {filteredProspects.map((prospect: any) => {
            const isSelected = currentSelectedIds.includes(prospect.id);
            return (
              <Card
                key={prospect.id}
                className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                  isSelected ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => onToggle(prospect.id)}
                data-testid={`prospect-card-${prospect.id}`}
              >
                <div className="flex items-start gap-3">
                  <div 
                    className={`flex items-center justify-center w-5 h-5 rounded border ${
                      isSelected 
                        ? 'bg-primary border-primary text-primary-foreground' 
                        : 'border-input bg-background'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {prospect.firstName} {prospect.lastName}
                      </span>
                    </div>
                    {prospect.email && (
                      <p className="text-sm text-muted-foreground">
                        {prospect.email}
                      </p>
                    )}
                    {prospect.jobTitle && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        <span>{prospect.jobTitle}</span>
                        {prospect.company && <span>at {prospect.company}</span>}
                      </div>
                    )}
                    {prospect.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{prospect.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
