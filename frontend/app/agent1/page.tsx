"use client" // 必须保留，因为有交互逻辑

import { useState } from "react" // 引入状态管理
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AgentPage() {
  // 1. 定义状态：input 存储输入内容，messages 存储对话历史
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([
    { role: "assistant", content: "你好！请发送你想分析的小红书链接。" }
  ])

  // 2. 定义发送逻辑
  const handleSend = async () => {
    if (!input.trim()) return // 输入为空则不发送

    // 先把用户的消息加到界面上
    const userMessage = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    
    const currentInput = input; // 备份输入
    setInput("") // 清空输入框

    try {
      // 3. 调用后端 Python 接口
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: currentInput,
          agent_id: "agent1"
        }),
      })

      const data = await response.json()
      
      // 4. 将后端返回的 AI 回复加入界面
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }])
    } catch (error) {
      console.error("发送失败:", error)
      setMessages((prev) => [...prev, { role: "assistant", content: "出错了，请检查后端服务是否启动。" }])
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col p-4 md:p-6 gap-4">
        <header className="py-4 border-b">
          <h1 className="text-xl font-bold text-slate-800">小红书信息提取助手</h1>
          <p className="text-sm text-slate-500">输入小红书链接，提取笔记信息</p>
        </header>

        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`p-3 rounded-lg max-w-[90%] ${
              msg.role === "user" 
                ? "bg-blue-600 text-white self-end ml-auto" 
                : "bg-slate-100 text-slate-800 self-start"
            }`}
          >

            {typeof msg.content === "string" && msg.content}

            {/* 如果是 AI 返回的 JSON 对象，直接格式化显示 */}
            {typeof msg.content === "object" && msg.content !== null && (
             <div className="space-y-2">
              <pre className="text-[12px] font-mono p-4 bg-slate-900 text-green-400 rounded-lg overflow-x-auto shadow-inner border-2 border-slate-800">
                {JSON.stringify((msg.content as any).data || msg.content, null, 2)}
              </pre>
             </div>
            )}
          </div>
        ))}

        <div className="pb-4">
          <div className="flex w-full items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm">
            {/* 6. 绑定 Value 和 OnChange */}
            <Input 
              className="flex-1 border-none focus-visible:ring-0" 
              placeholder="粘贴链接到这里..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()} 
            />
            {/* 7. 绑定 Click 事件 */}
            <Button className="px-6" onClick={handleSend}>发送</Button>
          </div>
        </div>
      </main>
    </div>
  )
}