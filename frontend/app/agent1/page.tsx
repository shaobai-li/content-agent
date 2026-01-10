"use client" // 必须保留，因为有交互逻辑

import { useState } from "react" // 引入状态管理
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function AgentPage() {
  // 1. 定义状态：input 存储输入内容，messages 存储对话历史
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([
    { role: "assistant", content: "你好！请发送你想分析的小红书笔记。" },
	{ role: "user", content: "这是我的小红书笔记链接：https://www.xiaohongshu.com/explore/69327271000000001e021002?xsec_token=ABKPhNpGT-KmvTfRRpKLWNgxPMDCtRt6hjnTQ47mrC6cU=&xsec_source=pc_feed"},
	{ role: "assistant", content: "好的，我正在分析你的小红书笔记..." },
	{ role: "assistant", content: "分析结果：这是一篇关于小红书笔记的分析结果。具体涵盖了关于苏州园林的介绍，以及一些相关的图片和视频。" },
	{ role: "user", content: "请继续分析这篇笔记。" },
	{ role: "assistant", content: "苏州，自古以来便有“人间天堂”的美誉，而真正让这座城市在中国乃至世界文化版图中占据重要地位的，正是独具特色的苏州园林。它们不仅是苏州的城市名片，更是中国古典园林艺术的杰出代表。苏州园林以其精巧的布局、深厚的文化底蕴以及诗意的空间表达，向世人展示了中国传统审美与东方哲学的高度融合。苏州园林并非单纯的自然景观，而是一种将建筑、山水、植物、书画、诗词融为一体的综合艺术。园林虽小，却讲究“咫尺之内，再造乾坤”，通过巧妙的空间安排，使有限的面积呈现出无限的意境。这种以小见大、以虚衬实的造园理念，是苏州园林最核心的精神所在。在众多苏州园林中，拙政园、留园、狮子林和沧浪亭无疑是最具代表性的几座。它们风格各异，却共同构成了苏州园林艺术的完整谱系。"},
	{ role: "user", content: "请继续分析这篇笔记。" },
	{ role: "assistant", content: "拙政园被誉为“苏州园林之首”，其最大的特色在于整体布局与水系设计。拙政园占地约18亩，是苏州现存规模最大的古典园林之一。园内以水为中心展开空间结构，池水蜿蜒，亭台楼阁依水而建，形成了开阔而灵动的景观效果。在这里，水不仅是景观元素，更是贯穿全园的灵魂所在。水面倒映着建筑与树影，使园林显得层次丰富、虚实相生。漫步其中，仿佛置身一幅缓缓展开的山水画卷，给人以宁静、从容之感，充分体现了文人园林追求自然、返璞归真的审美理想。"},
	{ role: "user", content: "请继续分析这篇笔记。" },
	{ role: "assistant", content: "如果说拙政园的精髓在于“水”，那么留园的魅力则集中体现在“建筑”之上。留园被称为中国园林建筑艺术的典范，其空间结构严谨而富于变化。园内厅堂、廊道、假山、庭院相互串联，既彼此独立，又相互呼应。建筑在这里不仅是使用功能的载体，更是塑造空间节奏和视觉秩序的关键。留园的建筑布局被视为苏州园林的“骨架”，它支撑起整个园林的形态与气质，使游览过程充满转折与惊喜。"},
	{ role: "user", content: "请继续分析这篇笔记。" },
	{ role: "assistant", content: "狮子林则以奇石闻名天下，是苏州园林中“以石见长”的代表。园内假山林立，形态各异，宛如群狮起舞，因此得名。这里的石并非简单的装饰，而是空间组织的重要元素。假山之间形成错综复杂的路径系统，行走其中，步移景异，充满探索的乐趣。石，在狮子林中不仅是视觉焦点，更承载着中国传统山水观念中“以石为骨”的思想，是园林精神的重要象征。"},
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
    <div className="h-full flex flex-grow flex-col border">
        <div className="flex-1 flex flex-col overflow-y-auto gap-4">
            {messages.map((msg, index) => (
                <div key={index} className={`p-3 rounded-lg max-w-[90%] ${
                    msg.role === "user" 
                        ? "bg-slate-100 text-slate-800 self-end"
                        : "bg-white text-slate-800 self-start"
                }`}>
                    <span>{msg.content}</span>
                </div>
            ))}
        </div>
        <div className="sticky bottom-0 bg-white border">
            <div className="flex w-full items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm">
                <Input 
                    className="flex-1 border-none focus-visible:ring-0 shadow-none" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()} 
                />
                <Button className="px-6" onClick={handleSend}>发送</Button>
            </div>
        </div>
    </div>
  )
}