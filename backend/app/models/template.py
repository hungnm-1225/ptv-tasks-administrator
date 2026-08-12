from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class TemplateConfigCreate(BaseModel):
    template_key: str
    name: str
    content_markdown: str
    fields_mapping: Optional[List[Dict[str, Any]]] = []


class TemplateConfigResponse(BaseModel):
    id: str
    template_key: str
    name: str
    content_markdown: str
    fields_mapping: List[Dict[str, Any]] = []
    updated_at: datetime
