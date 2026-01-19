import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function ChatInput({ value, onChange, onSend }: ChatInputProps) {
    return (
        
        <div className="flex items-center p-2 rounded-lg border shadow-sm">
            <Input
                className="flex-1 border-none focus-visible:ring-0 shadow-none"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSend()}
            />
            <Button size="sm" className="text-xs gap-2.5" onClick={onSend}>
                Send
            </Button>
        </div>
    );
}
    

