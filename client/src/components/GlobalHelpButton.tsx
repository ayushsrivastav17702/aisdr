import { useState } from "react";
import { HelpCircle, BookOpen, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/contexts/help-context";
import { Link } from "wouter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function GlobalHelpButton() {
  const { openPanel } = useHelp();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {isExpanded && (
        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Link href="/user-guide">
            <Button
              variant="outline"
              size="sm"
              className="shadow-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              data-testid="button-user-guide"
            >
              <BookOpen className="h-4 w-4" />
              User Guide
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              openPanel();
              setIsExpanded(false);
            }}
            className="shadow-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
            data-testid="button-quick-help"
          >
            <MessageCircle className="h-4 w-4" />
            Quick Help
          </Button>
        </div>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="global-help-button"
            >
              {isExpanded ? (
                <X className="h-6 w-6" />
              ) : (
                <HelpCircle className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{isExpanded ? "Close" : "Help & Support"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
