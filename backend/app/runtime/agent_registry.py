from app.agents.note_manager.agent_note_manager import NoteManager
from app.agents.write_agent.agent import WriteAgent

AGENT_REGISTRY = {
    "nm": NoteManager(),
    "w": WriteAgent(),
}
def get_agent(agent_id: str):
    return AGENT_REGISTRY.get(agent_id)
