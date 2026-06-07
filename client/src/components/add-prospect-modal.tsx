import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AddProspectModalProps {
  open: boolean;
  onClose: () => void;
}

interface ProspectForm {
  firstName: string;
  lastName: string;
  primaryEmail: string;
  companyName: string;
  jobTitle: string;
  linkedinUrl: string;
  phoneNumber: string;
}

const EMPTY_FORM: ProspectForm = {
  firstName: "",
  lastName: "",
  primaryEmail: "",
  companyName: "",
  jobTitle: "",
  linkedinUrl: "",
  phoneNumber: "",
};

export default function AddProspectModal({ open, onClose }: AddProspectModalProps) {
  const [form, setForm] = useState<ProspectForm>(EMPTY_FORM);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: ProspectForm) => apiRequest("POST", "/api/prospects", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
      toast({ title: "Prospect added", description: `${form.firstName} ${form.lastName} was added successfully.` });
      setForm(EMPTY_FORM);
      onClose();
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "Failed to add prospect",
        description: err?.message || "An error occurred.",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.primaryEmail.trim()) {
      toast({ variant: "destructive", title: "Email required", description: "Please enter an email address." });
      return;
    }
    createMutation.mutate(form);
  };

  const field = (
    id: keyof ProspectForm,
    label: string,
    required = false,
    type = "text"
  ) => (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label htmlFor={id} className="text-right">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={form[id]}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        className="col-span-3"
        required={required}
        data-testid={`input-${id}`}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Prospect</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {field("firstName", "First name", true)}
          {field("lastName", "Last name", true)}
          {field("primaryEmail", "Email", true, "email")}
          {field("companyName", "Company")}
          {field("jobTitle", "Job title")}
          {field("linkedinUrl", "LinkedIn URL")}
          {field("phoneNumber", "Phone")}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-add-prospect-submit">
              {createMutation.isPending ? "Adding..." : "Add Prospect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
