import { FileText, Loader2, CheckCircle2, AlertCircle, Circle } from "lucide-react";
import type { FileMessage, FileStatus } from "@/entities/message/model";
import { Card } from "@/shared/ui/card";

interface FileMessageItemProps {
  message: FileMessage;
}

const STEPS = [
  { id: "uploading",  label: "上传中..."          },
  { id: "processing", label: "正在转换文档内容..." },
  { id: "done",       label: "已导入知识库"        },
] as const;

type StepId = typeof STEPS[number]["id"];
type StepState = "done" | "active" | "pending" | "error";

const STEP_ORDER: StepId[] = ["uploading", "processing", "done"];

function getStepState(stepId: StepId, status: FileStatus): StepState {
  if (status === "error") {
    return stepId === "uploading" ? "error" : "pending";
  }
  if (status === "done") return "done";
  const statusIdx = STEP_ORDER.indexOf(status as StepId);
  const stepIdx   = STEP_ORDER.indexOf(stepId);
  if (stepIdx < statusIdx) return "done";
  if (stepIdx === statusIdx) return "active";
  return "pending";
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
    case "active":
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />;
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />;
  }
}

export function FileMessageItem({ message }: FileMessageItemProps) {
  return (
    <div className="self-start max-w-md w-full">
      <Card className="bg-muted px-3.5 py-3 gap-2.5 shadow-none">
        {/* 文件名 */}
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span
            className="text-sm font-medium text-foreground truncate"
            title={message.fileName}
          >
            {message.fileName}
          </span>
        </div>

        {/* 步骤列表 */}
        <div className="flex flex-col gap-1.5 pl-0.5">
          {STEPS.map((step) => {
            const state = getStepState(step.id, message.status);
            return (
              <div key={step.id} className="flex items-center gap-2">
                <StepIcon state={state} />
                <span
                  className={`text-xs transition-colors ${
                    state === "active"
                      ? "text-foreground font-medium"
                      : state === "done"
                      ? "text-muted-foreground"
                      : state === "error"
                      ? "text-destructive"
                      : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
