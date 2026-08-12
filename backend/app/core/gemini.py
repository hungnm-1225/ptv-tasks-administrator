import logging
import json
from typing import Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiEngine:
    """Gemini AI Triage Engine with model fallback capability."""

    def __init__(self):
        self.primary_model = settings.GEMINI_PRIMARY_MODEL
        self.fallback_model = settings.GEMINI_FALLBACK_MODEL
        self.api_key = settings.GEMINI_API_KEY

    async def triage_ticket(
        self, raw_content: str, subject: str = ""
    ) -> Dict[str, Any]:
        """Analyze ticket raw content, classify category, summarize, and produce automation payload recommendation."""
        prompt = f"""
        You are an AI Triage Assistant for Pythaverse Admin.
        Analyze this incoming ticket subject: "{subject}"
        Content: "{raw_content}"
        
        Return JSON with key fields:
        - "category": ("bug" | "account_keycloak" | "lms_enroll" | "license" | "other")
        - "priority": ("critical" | "normal")
        - "summary": short 1-2 sentence Vietnamese summary
        - "suggested_bot_type": ("keycloak_api" | "lms_playwright" | "github_issue_creator" | "google_doc_comment" | null)
        - "suggested_payload": JSON object with parameters for the bot execution if applicable.
        """

        try:
            # Try primary model via google-genai SDK
            return await self._call_gemini_api(self.primary_model, prompt)
        except Exception as e:
            logger.warning(
                f"Primary model {self.primary_model} failed: {e}. Falling back to {self.fallback_model}"
            )
            try:
                return await self._call_gemini_api(self.fallback_model, prompt)
            except Exception as fallback_err:
                logger.error(f"Fallback model failed: {fallback_err}")
                return {
                    "category": "other",
                    "priority": "normal",
                    "summary": f"Raw ticket content: {raw_content[:150]}...",
                    "suggested_bot_type": None,
                    "suggested_payload": {},
                }

    async def _call_gemini_api(self, model_name: str, prompt: str) -> Dict[str, Any]:
        """Invoke Gemini API."""

        # Lightweight fallback parser / demonstration response structure
        # When GEMINI_API_KEY is configured, SDK call is executed.
        if not self.api_key:
            return {
                "category": "bug",
                "priority": "normal",
                "summary": "Mô tả sự cố hệ thống cần được xử lý.",
                "suggested_bot_type": "github_issue_creator",
                "suggested_payload": {
                    "title": prompt[:50],
                    "body": prompt,
                    "labels": ["bug"],
                },
            }

        # Imports inside call for safety
        import google.generativeai as genai

        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(
            prompt, generation_config={"response_mime_type": "application/json"}
        )
        return json.loads(response.text)


gemini_engine = GeminiEngine()
