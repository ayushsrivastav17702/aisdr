import { useState, useEffect } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Search, 
  ChevronRight, 
  Lightbulb, 
  CheckCircle2, 
  BookOpen,
  ArrowLeft,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { 
  helpContent, 
  getModuleHelp, 
  getHelpItem, 
  searchHelp,
  type ModuleHelp,
  type HelpItem 
} from "@/lib/help-content";

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
  initialModuleId?: string;
  initialItemId?: string;
}

export function HelpPanel({ 
  open, 
  onClose, 
  initialModuleId,
  initialItemId 
}: HelpPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HelpItem[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<HelpItem | null>(null);
  const [view, setView] = useState<'modules' | 'module' | 'item'>('modules');

  useEffect(() => {
    if (open && initialModuleId) {
      setSelectedModule(initialModuleId);
      if (initialItemId) {
        const item = getHelpItem(initialModuleId, initialItemId);
        if (item) {
          setSelectedItem(item);
          setView('item');
        } else {
          setView('module');
        }
      } else {
        setView('module');
      }
    }
  }, [open, initialModuleId, initialItemId]);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const results = searchHelp(searchQuery);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleModuleClick = (moduleId: string) => {
    setSelectedModule(moduleId);
    setSelectedItem(null);
    setView('module');
    setSearchQuery("");
  };

  const handleItemClick = (moduleId: string, item: HelpItem) => {
    setSelectedModule(moduleId);
    setSelectedItem(item);
    setView('item');
    setSearchQuery("");
  };

  const handleBack = () => {
    if (view === 'item') {
      setSelectedItem(null);
      setView('module');
    } else if (view === 'module') {
      setSelectedModule(null);
      setView('modules');
    }
  };

  const handleClose = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedModule(null);
    setSelectedItem(null);
    setView('modules');
    onClose();
  };

  const currentModule = selectedModule ? getModuleHelp(selectedModule) : null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg p-0"
        data-testid="help-panel"
      >
        <div className="flex flex-col h-full">
          <SheetHeader className="p-6 pb-4 border-b">
            <div className="flex items-center gap-3">
              {view !== 'modules' && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleBack}
                  data-testid="help-panel-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="flex-1">
                <SheetTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  {view === 'modules' && "Help & Support"}
                  {view === 'module' && currentModule?.moduleName}
                  {view === 'item' && selectedItem?.title}
                </SheetTitle>
                <SheetDescription>
                  {view === 'modules' && "Find answers and learn how to use the platform"}
                  {view === 'module' && currentModule?.moduleDescription}
                  {view === 'item' && selectedItem?.shortDescription}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search help topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="help-panel-search"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {searchQuery.trim().length >= 2 ? (
                <SearchResultsView 
                  results={searchResults} 
                  onItemClick={handleItemClick}
                  query={searchQuery}
                />
              ) : view === 'modules' ? (
                <ModulesListView onModuleClick={handleModuleClick} />
              ) : view === 'module' && currentModule ? (
                <ModuleDetailView 
                  module={currentModule} 
                  onItemClick={(item) => handleItemClick(currentModule.moduleId, item)}
                />
              ) : view === 'item' && selectedItem ? (
                <ItemDetailView item={selectedItem} moduleId={selectedModule!} />
              ) : null}
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              Need more help? Contact support or check our documentation.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ModulesListView({ onModuleClick }: { onModuleClick: (id: string) => void }) {
  return (
    <div className="space-y-2" data-testid="help-modules-list">
      {helpContent.map((module) => (
        <button
          key={module.moduleId}
          onClick={() => onModuleClick(module.moduleId)}
          className="w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left group"
          data-testid={`help-module-${module.moduleId}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium group-hover:text-primary transition-colors">
                {module.moduleName}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {module.moduleDescription}
              </p>
              <Badge variant="secondary" className="mt-2">
                {module.items.length} topics
              </Badge>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
}

function ModuleDetailView({ 
  module, 
  onItemClick 
}: { 
  module: ModuleHelp; 
  onItemClick: (item: HelpItem) => void;
}) {
  return (
    <div className="space-y-2" data-testid="help-module-detail">
      {module.items.map((item) => (
        <button
          key={item.id}
          onClick={() => onItemClick(item)}
          className="w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left group"
          data-testid={`help-item-${item.id}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium group-hover:text-primary transition-colors">
                {item.title}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {item.shortDescription}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );
}

function ItemDetailView({ item, moduleId }: { item: HelpItem; moduleId: string }) {
  return (
    <div className="space-y-6" data-testid="help-item-detail">
      <div>
        <p className="text-muted-foreground leading-relaxed">
          {item.fullDescription}
        </p>
      </div>

      {item.steps && item.steps.length > 0 && (
        <div>
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            How to do it
          </h4>
          <ol className="space-y-2 ml-1">
            {item.steps.map((step, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </span>
                <span className="text-muted-foreground pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {item.tips && item.tips.length > 0 && (
        <div>
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            Pro Tips
          </h4>
          <ul className="space-y-2">
            {item.tips.map((tip, index) => (
              <li key={index} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-yellow-500">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.relatedTopics && item.relatedTopics.length > 0 && (
        <div>
          <Separator className="mb-4" />
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-blue-500" />
            Related Topics
          </h4>
          <div className="flex flex-wrap gap-2">
            {item.relatedTopics.map((topicId) => {
              const relatedItem = helpContent
                .flatMap(m => m.items)
                .find(i => i.id === topicId);
              return relatedItem ? (
                <Badge 
                  key={topicId} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-accent"
                >
                  {relatedItem.title}
                </Badge>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchResultsView({ 
  results, 
  onItemClick,
  query
}: { 
  results: HelpItem[]; 
  onItemClick: (moduleId: string, item: HelpItem) => void;
  query: string;
}) {
  const findModuleForItem = (itemId: string): string => {
    for (const module of helpContent) {
      if (module.items.some(i => i.id === itemId)) {
        return module.moduleId;
      }
    }
    return '';
  };

  if (results.length === 0) {
    return (
      <div className="text-center py-8" data-testid="help-no-results">
        <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No results found for "{query}"</p>
        <p className="text-sm text-muted-foreground mt-1">Try different keywords</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="help-search-results">
      <p className="text-sm text-muted-foreground mb-4">
        Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
      </p>
      {results.map((item) => {
        const moduleId = findModuleForItem(item.id);
        const module = getModuleHelp(moduleId);
        return (
          <button
            key={item.id}
            onClick={() => onItemClick(moduleId, item)}
            className="w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left group"
            data-testid={`help-search-result-${item.id}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="secondary" className="mb-2">
                  {module?.moduleName}
                </Badge>
                <h4 className="font-medium group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {item.shortDescription}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
