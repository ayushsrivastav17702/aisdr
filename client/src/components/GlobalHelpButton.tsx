import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/contexts/help-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function GlobalHelpButton() {
  const { openPanel } = useHelp();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={() => openPanel()}
            className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="global-help-button"
          >
            <HelpCircle className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Help & Support</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
