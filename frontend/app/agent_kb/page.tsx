"use client"

import { AgentPageLayout } from "@/components/layout/AgentPageLayout";
import { ChatPage } from "@/components/features/chat/ChatPage";
import { KbDataPanel } from "./components/KbDataPanel";
import { DataHeader } from "@/components/features/data/DataHeader";
import type { FileItem } from "@/components/features/chat/ChatInput";

// Mock 数据 - 仅用于样式预览
const mockFiles: FileItem[] = [
    { fileName: "项目需求文档.docx", fileType: "docx" },
    { fileName: "年度报告.pdf", fileType: "pdf" },
    { fileName: "产品介绍演示文稿.pptx", fileType: "pptx" },
    { fileName: "README.md", fileType: "md" },
];

export default function AgentKbPage() {
    // Mock 文件删除处理 - 仅用于样式演示
    const handleFileRemove = (index: number) => {
        console.log("Remove file at index:", index);
    };

    return (
        <AgentPageLayout 
            leftHeader={<DataHeader />}
            leftBody={<KbDataPanel />}
            rightBody={
                <ChatPage 
                    agentId="kb"
                    files={mockFiles}
                    onFileRemove={handleFileRemove}
                />
            }
        />
    );    
}

