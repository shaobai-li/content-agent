from pathlib import Path


def load_skill(skill_path: Path, skill_name: str) -> str:
    """Load skill content without frontmatter header"""
    skill_file = skill_path / skill_name / "SKILL.md"
    content = skill_file.read_text(encoding="utf-8")
    
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    
    return content.strip()
