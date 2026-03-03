from app.runtime.agent_registry import register_agent
from .agent import NoteManagerAgent

note_manager_agent = NoteManagerAgent()
register_agent(note_manager_agent)

