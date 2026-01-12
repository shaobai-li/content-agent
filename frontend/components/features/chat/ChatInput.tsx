import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function ChatInput({ value, onChange, onSend }: ChatInputProps) {
    return (
        <div className="sticky bottom-0 bg-white">
            <div className="flex w-full items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm">
                <Input
                    className="flex-1 border-none focus-visible:ring-0 shadow-none"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSend()}
                />
                <Button className="px-6" onClick={onSend}>
                    发送
                </Button>
            </div>
        </div>
    );
}
    

