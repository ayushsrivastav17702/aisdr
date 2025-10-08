import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  XIcon,
  FileTextIcon,
  SearchIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CloudUploadIcon,
  CheckIcon,
  AlertCircleIcon,
  TriangleAlert,
  XCircleIcon,
  DownloadIcon,
  InfoIcon,
  CheckCircleIcon,
} from "lucide-react";

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
}

type ImportStep = "choose" | "upload" | "mapping" | "review";

interface CSVColumn {
  name: string;
  samples: string[];
  mappedTo?: string;
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  columns: CSVColumn[];
  suggestedMappings: Record<string, string>;
}

export default function ImportWizard({ open, onClose }: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<ImportStep>("choose");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoEnrich, setAutoEnrich] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const validateCSVMutation = useMutation({
    mutationFn: api.validateCSV,
    onSuccess: (data) => {
      setValidation(data);
      setFieldMappings(data.suggestedMappings || {});
      setCurrentStep("mapping");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: error.message,
      });
    },
  });

  const uploadCSVMutation = useMutation({
    mutationFn: ({ file, mappings, options }: { 
      file: File; 
      mappings: Record<string, string>; 
      options: { skipDuplicates: boolean; autoEnrich: boolean; }
    }) => api.uploadCSV(file, mappings, options),
    onSuccess: (data: any) => {
      // Handle both job-based (Redis) and direct (no Redis) responses
      if (data.job) {
        // Redis-based background job
        toast({
          title: "Import Started",
          description: "Your CSV import job has been queued successfully",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      } else if (data.success !== undefined) {
        // Direct/synchronous import (no Redis)
        const { imported, failed, duplicates, message } = data;
        
        if (imported > 0) {
          toast({
            title: "Import Complete",
            description: message || `Successfully imported ${imported} prospects${duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ''}`,
          });
        } else if (failed > 0) {
          toast({
            variant: "destructive",
            title: "Import Failed",
            description: `Failed to import prospects. Check the console for details.`,
          });
        }
        
        // Refresh prospects list
        queryClient.invalidateQueries({ queryKey: ["/api/prospects"] });
      }
      
      onClose();
      resetWizard();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error.message,
      });
    },
  });

  const resetWizard = () => {
    setCurrentStep("choose");
    setSelectedFile(null);
    setValidation(null);
    setFieldMappings({});
    setSkipDuplicates(true);
    setAutoEnrich(false);
  };

  const handleClose = () => {
    onClose();
    resetWizard();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setCurrentStep("upload");
    }
  };

  const handleContinueToMapping = () => {
    if (!selectedFile) return;
    validateCSVMutation.mutate(selectedFile);
  };

  const handleStartImport = () => {
    if (!selectedFile) return;
    uploadCSVMutation.mutate({
      file: selectedFile,
      mappings: fieldMappings,
      options: { skipDuplicates, autoEnrich }
    });
  };

  const getStepNumber = (step: ImportStep) => {
    const steps = ["choose", "upload", "mapping", "review"];
    return steps.indexOf(step) + 1;
  };

  const isStepCompleted = (step: ImportStep) => {
    const currentStepIndex = getStepNumber(currentStep) - 1;
    const stepIndex = getStepNumber(step) - 1;
    return stepIndex < currentStepIndex;
  };

  const renderProgressIndicator = () => (
    <div className="px-6 py-4 bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        {(["choose", "upload", "mapping", "review"] as ImportStep[]).map((step) => {
          const stepNum = getStepNumber(step);
          const isCompleted = isStepCompleted(step);
          const isCurrent = currentStep === step;
          const stepLabels = {
            choose: "Choose Type",
            upload: "Upload File", 
            mapping: "Map Fields",
            review: "Review"
          };

          return (
            <div key={step} className={`flex items-center gap-2 ${!isCurrent && !isCompleted ? 'opacity-50' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                isCompleted 
                  ? 'bg-emerald-500 text-white' 
                  : isCurrent 
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted border-2 border-border'
              }`}>
                {isCompleted ? <CheckIcon className="w-4 h-4" /> : stepNum}
              </div>
              <span className="text-sm font-medium">{stepLabels[step]}</span>
            </div>
          );
        })}
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(getStepNumber(currentStep) / 4) * 100}%` }}
        />
      </div>
    </div>
  );

  const renderChooseStep = () => (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card 
          className="p-6 border-2 border-primary bg-primary/5 cursor-pointer hover:bg-primary/10 transition-all"
          onClick={() => document.getElementById('csv-file-input')?.click()}
          data-testid="option-csv-upload"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <FileTextIcon className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">CSV Upload</h4>
              <p className="text-sm text-muted-foreground">Upload a CSV or Excel file with prospect data</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Badge variant="secondary">Auto-mapping</Badge>
              <Badge variant="secondary">Validation</Badge>
            </div>
          </div>
        </Card>

        <Card 
          className="p-6 border-2 border-border cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
          onClick={() => {
            toast({
              title: "Use AI Search",
              description: "Use the AI Search feature on the main dashboard to find and save prospects from Apollo.io",
            });
            handleClose();
          }}
          data-testid="option-apollo-search"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <SearchIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">Apollo Search</h4>
              <p className="text-sm text-muted-foreground">Search and import directly from Apollo.io</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Badge variant="secondary">AI Search</Badge>
              <Badge variant="secondary">Filters</Badge>
            </div>
          </div>
        </Card>
      </div>

      <input
        id="csv-file-input"
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file-upload"
      />
    </div>
  );

  const renderUploadStep = () => (
    <div className="p-6 space-y-6">
      <div 
        className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
        onClick={() => document.getElementById('csv-file-input-2')?.click()}
        data-testid="dropzone-upload"
      >
        <CloudUploadIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h4 className="text-lg font-semibold mb-2">
          {selectedFile ? selectedFile.name : 'Drag and drop your file here'}
        </h4>
        <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
        <p className="text-xs text-muted-foreground">Supports CSV, XLSX, XLS (Max 10MB)</p>
      </div>

      <Card className="bg-muted/50 p-4">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <InfoIcon className="w-4 h-4 text-primary" />
          File Requirements
        </h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5" />
            <span>First row should contain column headers</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5" />
            <span>At minimum, include: Name and (Email or LinkedIn URL)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5" />
            <span>Recommended fields: Company, Title, Location, Phone</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5" />
            <span>Maximum file size: 10MB (approximately 50,000 rows)</span>
          </li>
        </ul>
      </Card>

      <Card className="flex items-center justify-between p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
            <DownloadIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Need a template?</p>
            <p className="text-xs text-muted-foreground">Download our sample CSV file to get started</p>
          </div>
        </div>
        <Button variant="outline" data-testid="button-download-template">
          <DownloadIcon className="w-4 h-4 mr-2" />
          Download Template
        </Button>
      </Card>

      <input
        id="csv-file-input-2"
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );

  const renderMappingStep = () => {
    if (!validation) return null;

    const mappedCount = Object.values(fieldMappings).filter(v => v && v !== "do_not_import").length;
    const needsAttentionCount = validation.columns.length - mappedCount;

    return (
      <div className="p-6 space-y-6">
        <Card className="flex items-start gap-3 p-4 bg-emerald-50 border-emerald-200">
          <CheckCircleIcon className="w-5 h-5 text-emerald-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-900">Auto-mapping completed</p>
            <p className="text-sm text-emerald-700 mt-1">
              We've automatically mapped {mappedCount} of {validation.columns.length} fields. Please review and adjust as needed.
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 p-4 bg-muted/50">
          <div className="flex items-center gap-3 flex-1">
            <FileTextIcon className="w-8 h-8 text-primary" />
            <div>
              <p className="text-sm font-medium">{selectedFile?.name}</p>
              <p className="text-xs text-muted-foreground">
                {validation.totalRows} rows • {validation.columns.length} columns
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" data-testid="button-change-file">
            Change File
          </Button>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/3">
                  CSV Column
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/3">
                  Maps To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-1/3">
                  Sample Data
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {validation.columns.map((column, index) => {
                const mappedField = fieldMappings[column.name] || "";
                const isMapped = mappedField && mappedField !== "do_not_import";

                return (
                  <tr key={index} data-testid={`mapping-row-${index}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <FileTextIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium font-mono">{column.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Select
                          value={mappedField}
                          onValueChange={(value) => setFieldMappings(prev => ({ ...prev, [column.name]: value }))}
                        >
                          <SelectTrigger className={`flex-1 ${isMapped ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : ''}`}>
                            <SelectValue placeholder="-- Select Field --" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="firstName">First Name</SelectItem>
                            <SelectItem value="lastName">Last Name</SelectItem>
                            <SelectItem value="fullName">Full Name</SelectItem>
                            <SelectItem value="primaryEmail">Primary Email</SelectItem>
                            <SelectItem value="secondaryEmail">Secondary Email</SelectItem>
                            <SelectItem value="jobTitle">Job Title</SelectItem>
                            <SelectItem value="seniority">Seniority Level</SelectItem>
                            <SelectItem value="department">Department</SelectItem>
                            <SelectItem value="companyName">Company Name</SelectItem>
                            <SelectItem value="companyDomain">Company Domain</SelectItem>
                            <SelectItem value="companySize">Company Size</SelectItem>
                            <SelectItem value="companyIndustry">Company Industry</SelectItem>
                            <SelectItem value="companyLocation">Company Location</SelectItem>
                            <SelectItem value="contactLocation">Contact Location</SelectItem>
                            <SelectItem value="phoneNumber">Phone Number</SelectItem>
                            <SelectItem value="linkedinUrl">LinkedIn URL</SelectItem>
                            <SelectItem value="do_not_import">Do not import</SelectItem>
                          </SelectContent>
                        </Select>
                        {isMapped ? (
                          <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <TriangleAlert className="w-5 h-5 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-muted-foreground font-mono">
                        {column.samples.slice(0, 2).join(", ")}...
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{mappedCount}</p>
                <p className="text-xs text-muted-foreground">Mapped Fields</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                <TriangleAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{needsAttentionCount}</p>
                <p className="text-xs text-muted-foreground">Needs Attention</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <XIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">0</p>
                <p className="text-xs text-muted-foreground">Not Mapped</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const renderReviewStep = () => {
    if (!validation) return null;

    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <FileTextIcon className="w-5 h-5 text-primary" />
            </div>
            <p className="text-2xl font-bold mb-1">{validation.totalRows}</p>
            <p className="text-xs text-muted-foreground">Total Rows</p>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-600 mb-1">{validation.validRows}</p>
            <p className="text-xs text-emerald-700">Valid Records</p>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <div className="flex items-center justify-between mb-2">
              <TriangleAlert className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-600 mb-1">{validation.duplicateRows}</p>
            <p className="text-xs text-amber-700">Duplicates</p>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200">
            <div className="flex items-center justify-between mb-2">
              <XCircleIcon className="w-5 h-5 text-rose-600" />
            </div>
            <p className="text-2xl font-bold text-rose-600 mb-1">{validation.errorRows}</p>
            <p className="text-xs text-rose-700">Errors</p>
          </Card>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Validation Results</h4>
          
          <Card className="flex items-start gap-3 p-3 bg-emerald-50 border-emerald-200">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-900">
                {validation.validRows} valid prospects ready to import
              </p>
              <p className="text-xs text-emerald-700 mt-1">All required fields are present and validated</p>
            </div>
          </Card>

          {validation.duplicateRows > 0 && (
            <Card className="flex items-start gap-3 p-3 bg-amber-50 border-amber-200">
              <TriangleAlert className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">
                  {validation.duplicateRows} potential duplicates detected
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Prospects with matching emails or domains will be skipped
                </p>
              </div>
            </Card>
          )}

          {validation.errorRows > 0 && (
            <Card className="flex items-start gap-3 p-3 bg-rose-50 border-rose-200">
              <XCircleIcon className="w-5 h-5 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-900">
                  {validation.errorRows} rows have validation errors
                </p>
                <p className="text-xs text-rose-700 mt-1">
                  Missing required fields (Name or Email). These will be skipped.
                </p>
              </div>
            </Card>
          )}
        </div>

        <Card className="p-4 bg-muted/30 space-y-3">
          <h4 className="text-sm font-medium">Import Options</h4>
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox 
              checked={skipDuplicates} 
              onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
              data-testid="checkbox-skip-duplicates"
            />
            <div>
              <p className="text-sm font-medium">Skip duplicates</p>
              <p className="text-xs text-muted-foreground">
                Don't import prospects with matching emails or domains
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox 
              checked={autoEnrich} 
              onCheckedChange={(checked) => setAutoEnrich(checked === true)}
              data-testid="checkbox-auto-enrich"
            />
            <div>
              <p className="text-sm font-medium">Auto-enrich after import</p>
              <p className="text-xs text-muted-foreground">
                Automatically enrich valid prospects with Apollo data
              </p>
            </div>
          </label>
        </Card>
      </div>
    );
  };

  const renderContent = () => {
    switch (currentStep) {
      case "choose": return renderChooseStep();
      case "upload": return renderUploadStep();
      case "mapping": return renderMappingStep();
      case "review": return renderReviewStep();
      default: return null;
    }
  };

  const canContinue = () => {
    switch (currentStep) {
      case "upload": return !!selectedFile;
      case "mapping": return validation && Object.keys(fieldMappings).length > 0;
      case "review": return true;
      default: return false;
    }
  };

  const getTitle = () => {
    const titles = {
      choose: "Import Prospects",
      upload: "Import Prospects - CSV Upload", 
      mapping: "Import Prospects - Field Mapping",
      review: "Import Prospects - Review & Import"
    };
    return titles[currentStep];
  };

  const getSubtitle = () => {
    const subtitles = {
      choose: "Step 1 of 4: Choose Import Method",
      upload: "Step 2 of 4: Upload Your File",
      mapping: "Step 3 of 4: Map Your Data Fields", 
      review: "Step 4 of 4: Review and Confirm Import"
    };
    return subtitles[currentStep];
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0" data-testid="dialog-import-wizard">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle data-testid="wizard-title">{getTitle()}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1" data-testid="wizard-subtitle">
                {getSubtitle()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              data-testid="button-close-wizard"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {renderProgressIndicator()}

        <div className="overflow-y-auto max-h-[calc(90vh-240px)]">
          {renderContent()}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep === "upload") setCurrentStep("choose");
              else if (currentStep === "mapping") setCurrentStep("upload");
              else if (currentStep === "review") setCurrentStep("mapping");
            }}
            disabled={currentStep === "choose"}
            data-testid="button-back"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
              Cancel
            </Button>
            
            {currentStep === "upload" && (
              <Button
                onClick={handleContinueToMapping}
                disabled={!canContinue() || validateCSVMutation.isPending}
                data-testid="button-continue-mapping"
              >
                {validateCSVMutation.isPending ? "Validating..." : "Continue"}
                <ArrowRightIcon className="w-4 h-4 ml-2" />
              </Button>
            )}
            
            {currentStep === "mapping" && (
              <Button
                onClick={() => setCurrentStep("review")}
                disabled={!canContinue()}
                data-testid="button-continue-review"
              >
                Continue to Review
                <ArrowRightIcon className="w-4 h-4 ml-2" />
              </Button>
            )}
            
            {currentStep === "review" && (
              <Button
                onClick={handleStartImport}
                disabled={uploadCSVMutation.isPending}
                data-testid="button-start-import"
              >
                {uploadCSVMutation.isPending ? "Starting..." : `Import ${validation?.validRows || 0} Prospects`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
