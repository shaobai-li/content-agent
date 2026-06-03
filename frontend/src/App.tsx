import { Routes, Route } from "react-router-dom";
import { ClientShell } from "./client-shell";
import { LoginPage } from "@/features/auth/LoginPage";
import AgentPage from "./pages/AgentPage";

function Home() {
  return (
    <div className="flex-1 bg-white">
      {/* 内容区域可以在这里添加 */}
    </div>
  );
}

export default function App() {
  return (
    <ClientShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Home />} />
        <Route path="/agent/:agentId" element={<AgentPage />} />
      </Routes>
    </ClientShell>
  );
}
