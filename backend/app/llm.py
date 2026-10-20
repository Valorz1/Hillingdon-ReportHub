"""
LLM integration stub — NIM removed.
All functions return safe defaults so callers require no changes.
"""

async def llm_classify(subject: str, description: str):
    return None

async def llm_analyse_image(data_url: str):
    return None

async def llm_clean_transcript(raw: str) -> str:
    return raw

async def llm_chat(conversation: list[dict]) -> str:
    return ""
