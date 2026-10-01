# backend/app/services/course_knowledge_service.py
"""
Course & Entity Knowledge Service (Enterprise Central Course Resolver)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Tra cứu song song 2 bảng CSDL: `lms_courses` và `workspace_courses` với In-Memory Cache (TTL 10 phút).
- Soi chiếu thông minh 4 tầng:
  + Tầng 1: Match chính xác theo Course ID số (VD: 695, 1437, 1445, ?id=695).
  + Tầng 2: Match theo Mã viết tắt chuẩn (VD: SWRP 11 -> SWRP 11: Exploring IoT and AI with LEANBOT Intermediate [V2] (EN)).
  + Tầng 3: Token-Set / Substring Fuzzy Matching (khử rác: Primary, Secondary, &amp;, [Trial], [DEMO]).
  + Tầng 4: Tự động trích xuất Git Repository chuẩn từ cột git_repos JSONB (phân biệt Giáo viên vs Học sinh).
- Mồi ứng viên thông minh (Smart Candidate Injection) cho AI Summarizer và AI Planner.
"""

import os
import re
import time
import json
import logging
from typing import Dict, Any, List, Optional, Tuple, Set

logger = logging.getLogger(__name__)

_GLOBAL_COURSE_CACHE: Dict[str, Any] = {
    "courses": [],          # Danh sách đã gộp và chuẩn hóa
    "by_id": {},            # Dict tra cứu nhanh O(1) theo course_id int
    "by_code": {},          # Dict tra cứu nhanh theo mã viết tắt: 'SWRP 11', 'SWRP 1', 'ASP 2'...
    "expires_at": 0.0
}


def clean_course_name_text(raw_name: str) -> str:
    """Làm sạch tên môn học, chuyển HTML entities (&amp; -> &), chuẩn hóa khoảng trắng."""
    if not raw_name:
        return ""
    text = str(raw_name).replace("&amp;", "&").replace("&quot;", '"').replace("&#039;", "'").strip()
    return re.sub(r"\s+", " ", text)


class CourseKnowledgeService:
    def __init__(self):
        pass

    @classmethod
    def get_unified_course_catalog(cls, supabase) -> List[Dict[str, Any]]:
        """
        Nạp toàn bộ khóa học từ CẢ 2 BẢNG `lms_courses` và `workspace_courses`.
        - Hợp nhất và ưu tiên bản ghi có `git_repos` và tên đầy đủ chuẩn hóa nhất.
        - Lưu vào In-Memory Cache với TTL 10 phút (0ms latency cho các lượt gọi sau).
        """
        global _GLOBAL_COURSE_CACHE
        now = time.time()

        if _GLOBAL_COURSE_CACHE["courses"] and _GLOBAL_COURSE_CACHE["expires_at"] > now:
            return _GLOBAL_COURSE_CACHE["courses"]

        merged_catalog: Dict[int, Dict[str, Any]] = {}

        try:
            # 1. Truy vấn bảng lms_courses
            res_lms = supabase.table("lms_courses")\
                .select("id, course_id, category, course_name, lms_url, git_repos, git_repo_url")\
                .order("course_id", desc=False)\
                .execute()
            
            for row in (res_lms.data or []):
                cid = row.get("course_id")
                if not cid:
                    continue
                c_name = clean_course_name_text(row.get("course_name") or "")
                merged_catalog[cid] = {
                    "id": cid,
                    "name": c_name,
                    "category": row.get("category") or "",
                    "lms_url": row.get("lms_url") or "",
                    "git_repos": row.get("git_repos") or [],
                    "git_repo_url": row.get("git_repo_url") or "",
                    "source_table": "lms_courses"
                }

            # 2. Truy vấn bảng workspace_courses (bổ sung hoặc nâng cấp thông tin có [V2], git_repos mới hơn)
            res_ws = supabase.table("workspace_courses")\
                .select("id, course_id, category, course_name, lms_url, git_repos, git_repo_url")\
                .order("course_id", desc=False)\
                .execute()

            for row in (res_ws.data or []):
                cid = row.get("course_id")
                if not cid:
                    continue
                c_name = clean_course_name_text(row.get("course_name") or "")
                existing = merged_catalog.get(cid)

                # Nếu chưa có, thêm mới
                if not existing:
                    merged_catalog[cid] = {
                        "id": cid,
                        "name": c_name,
                        "category": row.get("category") or "",
                        "lms_url": row.get("lms_url") or "",
                        "git_repos": row.get("git_repos") or [],
                        "git_repo_url": row.get("git_repo_url") or "",
                        "source_table": "workspace_courses"
                    }
                else:
                    # Nếu bản ghi workspace_courses có thông tin chi tiết hơn (như [V2] hoặc có git_repos), cập nhật
                    if "[v2]" in c_name.lower() or not existing.get("git_repos") and row.get("git_repos"):
                        existing["name"] = c_name
                    if not existing.get("git_repos") and row.get("git_repos"):
                        existing["git_repos"] = row.get("git_repos")
                    if not existing.get("git_repo_url") and row.get("git_repo_url"):
                        existing["git_repo_url"] = row.get("git_repo_url")

        except Exception as err:
            logger.warning(f"⚠️ Lỗi nạp danh mục khóa học từ Supabase: {err}")

        catalog_list = list(merged_catalog.values())

        # Xây dựng chỉ mục nhanh theo mã môn: SWRP 11, SWRP 1, IR 4, ASP...
        by_id_map: Dict[int, Dict[str, Any]] = {}
        by_code_map: Dict[str, List[Dict[str, Any]]] = {}

        for item in catalog_list:
            cid = item["id"]
            by_id_map[cid] = item
            c_name = item["name"]

            # Bóc tách mã viết tắt (VD: "SWRP 11", "SWRP 1", "ASP 2")
            m = re.search(r"\b([A-Za-z]+)\s*[-_]?\s*(\d+)\b", c_name)
            if m:
                code_key = f"{m.group(1).upper()} {m.group(2)}"
                by_code_map.setdefault(code_key, []).append(item)

        _GLOBAL_COURSE_CACHE["courses"] = catalog_list
        _GLOBAL_COURSE_CACHE["by_id"] = by_id_map
        _GLOBAL_COURSE_CACHE["by_code"] = by_code_map
        _GLOBAL_COURSE_CACHE["expires_at"] = now + 600.0

        logger.info(f"💾 [Course Knowledge] Đã nạp & đồng bộ {len(catalog_list)} khóa học từ 2 bảng (TTL: 10m)!")
        return catalog_list

    @classmethod
    def resolve_canonical_course(
        cls,
        supabase,
        course_query: str,
        is_teacher: bool = False,
        preferred_lang: str = "EN"
    ) -> Tuple[str, Optional[int], Optional[str], List[Dict[str, Any]]]:
        """
        Soi chiếu một chuỗi tên môn học người dùng cung cấp vào CSDL khóa học.
        Trả về Tuple: (canonical_full_name, course_id, resolved_git_repo, all_git_repos)

        Ví dụ:
        - Input: "SWRP 11"
        - Output: ("SWRP 11: Exploring IoT and AI with LEANBOT Intermediate [V2] (EN)", 695, "https://git...", [...])
        """
        if not course_query or not str(course_query).strip():
            return "", None, None, []

        clean_q = str(course_query).strip()
        all_courses = cls.get_unified_course_catalog(supabase)
        by_id = _GLOBAL_COURSE_CACHE.get("by_id", {})
        by_code = _GLOBAL_COURSE_CACHE.get("by_code", {})

        # =====================================================================
        # 🎯 TẦNG 1: BẮT THẲNG COURSE ID SỐ (view.php?id=695, ID 695, 695)
        # =====================================================================
        course_id_target = None
        id_url_match = re.search(r"[?&]id=(\d+)", clean_q)
        if id_url_match:
            course_id_target = int(id_url_match.group(1))
        elif clean_q.isdigit():
            course_id_target = int(clean_q)
        else:
            id_inline_match = re.search(r"\b(?:id|course)[\s:#]*(\d+)\b", clean_q, re.IGNORECASE)
            if id_inline_match:
                course_id_target = int(id_inline_match.group(1))

        if course_id_target and course_id_target in by_id:
            c_item = by_id[course_id_target]
            resolved_repo, all_repos = cls._pick_git_repo(c_item.get("git_repos"), is_teacher)
            logger.info(f"🎯 [Course Knowledge - Tầng 1 ID] #{course_id_target} -> [{c_item['name']}]")
            return c_item["name"], course_id_target, resolved_repo, all_repos

        # =====================================================================
        # 🎯 TẦNG 2: BẮT MÃ MÔN VIẾT TẮT CHÍNH XÁC (SWRP 11, SWRP 1, IR 4...)
        # =====================================================================
        code_match = re.search(r"\b([A-Za-z]{2,8})\s*[-_]?\s*(\d{1,3})\b", clean_q)
        if code_match:
            prefix = code_match.group(1).upper()
            num = code_match.group(2)
            code_key = f"{prefix} {num}"

            if code_key in by_code:
                candidate_list = by_code[code_key]
                # Chọn bản ghi tốt nhất trong các bản ghi cùng mã (ưu tiên [V2], EN, tránh DEMO nếu có thể)
                best_item = cls._pick_best_course_variant(candidate_list, clean_q, preferred_lang)
                if best_item:
                    resolved_repo, all_repos = cls._pick_git_repo(best_item.get("git_repos"), is_teacher)
                    logger.info(f"🎯 [Course Knowledge - Tầng 2 Mã Môn] '{clean_q}' -> [{best_item['name']}] (ID: {best_item['id']})")
                    return best_item["name"], best_item["id"], resolved_repo, all_repos

        # =====================================================================
        # 🎯 TẦNG 3: LỘT BỎ RÁC & SO KHỚP CHUỖI TÊN ĐẦY ĐỦ (TOKEN MATCHING)
        # =====================================================================
        # Cắt sạch các hậu tố râu ria: (Primary), (Secondary), &amp;, [Trial], v.v.
        normalized_q = re.sub(r"\s*[\(\[](?:Primary|Secondary|HighSchool|VN|Cả GV & HS|GV|HS)[\)\]]", "", clean_q, flags=re.IGNORECASE).strip()
        normalized_q = clean_course_name_text(normalized_q)
        normalized_q = re.sub(r"(?i)\b(?:courses?|khóa\s*học)\b", "", normalized_q).strip(" :-,")

        # 3.1. Tìm kiếm chuỗi con trực tiếp (Substring)
        if len(normalized_q) >= 4:
            matched_substrings = []
            for item in all_courses:
                c_name_clean = item["name"]
                if normalized_q.lower() in c_name_clean.lower():
                    matched_substrings.append(item)
            if matched_substrings:
                best_item = cls._pick_best_course_variant(matched_substrings, clean_q, preferred_lang)
                if best_item:
                    resolved_repo, all_repos = cls._pick_git_repo(best_item.get("git_repos"), is_teacher)
                    logger.info(f"🎯 [Course Knowledge - Tầng 3 Substring] '{clean_q}' -> [{best_item['name']}] (ID: {best_item['id']})")
                    return best_item["name"], best_item["id"], resolved_repo, all_repos

        # 3.2. Chấm điểm token ngữ nghĩa (Semantic Token Overlap)
        q_tokens = set(re.findall(r"[a-zA-Z0-9]+", normalized_q.lower()))
        stopwords = {"and", "the", "for", "with", "khoa", "hoc", "lop", "mon", "level", "in", "of"}
        meaningful_tokens = q_tokens - stopwords

        if len(meaningful_tokens) >= 2:
            scored = []
            for item in all_courses:
                c_tokens = set(re.findall(r"[a-zA-Z0-9]+", item["name"].lower()))
                overlap = len(meaningful_tokens.intersection(c_tokens))
                if overlap >= 2:
                    score = overlap * 10
                    # Cộng điểm nếu có cùng hậu tố ngôn ngữ hoặc phiên bản
                    if "(en)" in item["name"].lower() and "(en)" in clean_q.lower():
                        score += 5
                    if "[v2]" in item["name"].lower():
                        score += 3
                    scored.append((score, item))

            if scored:
                scored.sort(key=lambda x: x[0], reverse=True)
                top_match = scored[0][1]
                resolved_repo, all_repos = cls._pick_git_repo(top_match.get("git_repos"), is_teacher)
                logger.info(f"🎯 [Course Knowledge - Tầng 3 Token Match] '{clean_q}' -> [{top_match['name']}] (ID: {top_match['id']})")
                return top_match["name"], top_match["id"], resolved_repo, all_repos

        # Fallback: Trả về chính chuỗi ban đầu nếu không tìm thấy trong CSDL
        logger.info(f"ℹ️ [Course Knowledge] Không tìm thấy môn khớp trong CSDL cho: '{clean_q}'")
        return clean_q, None, None, []

    @classmethod
    def _pick_best_course_variant(
        cls,
        candidates: List[Dict[str, Any]],
        original_query: str,
        preferred_lang: str = "EN"
    ) -> Optional[Dict[str, Any]]:
        """Lựa chọn phiên bản môn học phù hợp nhất từ danh sách cùng mã."""
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]

        q_lower = original_query.lower()
        wants_demo = "demo" in q_lower or "trial" in q_lower
        wants_cn = "cn" in q_lower or "chinese" in q_lower or "tiếng trung" in q_lower
        wants_vn = "vn" in q_lower or "tiếng việt" in q_lower or "vietnam" in q_lower

        # Tính điểm ưu tiên cho từng ứng viên
        scored = []
        for item in candidates:
            c_name_lower = item["name"].lower()
            score = 10

            # Tiêu chí 1: [V2] được ưu tiên cao hơn bản cũ
            if "[v2]" in c_name_lower:
                score += 20

            # Tiêu chí 2: Có git_repos đi kèm được cộng điểm
            if item.get("git_repos") and len(item["git_repos"]) > 0:
                score += 15

            # Tiêu chí 3: Bản DEMO
            if "[demo]" in c_name_lower or "[trial]" in c_name_lower:
                if wants_demo:
                    score += 30
                else:
                    score -= 25  # Trừ điểm DEMO nếu người dùng không yêu cầu DEMO

            # Tiêu chí 4: Ngôn ngữ
            if wants_cn:
                if "(cn)" in c_name_lower:
                    score += 30
            elif wants_vn:
                if "khám phá" in c_name_lower or "(vn)" in c_name_lower:
                    score += 30
            else:
                # Mặc định ưu tiên (EN)
                if "(en)" in c_name_lower:
                    score += 10

            scored.append((score, item))

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    @classmethod
    def _pick_git_repo(
        cls,
        git_repos: Optional[List[Any]],
        is_teacher: bool = False
    ) -> Tuple[Optional[str], List[Dict[str, Any]]]:
        """Trích xuất URL repo phù hợp cho Giáo viên hoặc Học sinh từ cấu trúc git_repos JSONB."""
        if not git_repos or not isinstance(git_repos, list):
            return None, []

        clean_repos: List[Dict[str, Any]] = []
        teacher_repo: Optional[str] = None
        general_repo: Optional[str] = None

        for item in git_repos:
            r_url = None
            r_target = "all"

            if isinstance(item, dict):
                r_url = item.get("repo_url") or item.get("url")
                r_target = str(item.get("target") or "all").lower()
            elif isinstance(item, str) and item.startswith("http"):
                r_url = item
                r_target = "all"

            if not r_url or not r_url.startswith("http"):
                continue

            clean_repos.append({"repo_url": r_url, "target": r_target})

            if any(k in r_target for k in ["teacher", "teacher_only", "gv"]):
                if not teacher_repo:
                    teacher_repo = r_url
            else:
                if not general_repo:
                    general_repo = r_url

        if is_teacher and teacher_repo:
            return teacher_repo, clean_repos
        return (general_repo or teacher_repo), clean_repos

    @classmethod
    def get_smart_catalog_context(
        cls,
        supabase,
        raw_text: str = "",
        subject: str = "",
        excel_summary: Optional[Dict[str, Any]] = None,
        max_candidates: int = 12
    ) -> List[Dict[str, Any]]:
        """
        Lọc danh sách các khóa học liên quan nhất từ CSDL để nhồi vào bối cảnh AI:
        - Soát sạch thân email, tiêu đề, và cả nội dung file Excel đã bóc tách.
        - Tìm kiếm theo mã viết tắt, tên môn học, số hiệu môn.
        - Trả về danh sách ứng viên có đầy đủ Course ID và tên chuẩn mực.
        """
        all_courses = cls.get_unified_course_catalog(supabase)
        if not all_courses:
            return []

        search_parts = [subject or "", raw_text or ""]
        if excel_summary and isinstance(excel_summary, dict):
            if excel_summary.get("school_name"):
                search_parts.append(str(excel_summary["school_name"]))
            for cd in excel_summary.get("courses_detected") or []:
                search_parts.append(str(cd))
            for c in excel_summary.get("courses") or []:
                if isinstance(c, dict):
                    search_parts.append(str(c.get("course_name") or c.get("name") or ""))
                elif isinstance(c, str):
                    search_parts.append(str(c))

        search_corpus = " ".join(search_parts).lower()
        if not search_corpus.strip():
            return all_courses[:max_candidates]

        words_in_text = set(re.findall(r"[a-zA-Z0-9_\-]+", search_corpus))

        # Phát hiện các mã môn cụ thể trong text (SWRP 11, SWRP 1, ASP 2...)
        explicit_codes = set()
        for m in re.finditer(r"\b([A-Za-z]{2,8})\s*[-_]?\s*(\d{1,3})\b", search_corpus):
            explicit_codes.add(f"{m.group(1).upper()} {m.group(2)}")

        scored_courses = []
        for course in all_courses:
            c_name_lower = course["name"].lower()
            c_id_str = str(course["id"])
            score = 0

            # Tiêu chí 1: Trùng trực tiếp Course ID
            if c_id_str in words_in_text:
                score += 120

            # Tiêu chí 2: Trùng mã viết tắt đích xác (VD: "SWRP 11")
            m_code = re.search(r"\b([A-Za-z]{2,8})\s*[-_]?\s*(\d{1,3})\b", course["name"])
            if m_code:
                c_code = f"{m_code.group(1).upper()} {m_code.group(2)}"
                if c_code in explicit_codes:
                    score += 100
                    # Thưởng thêm cho bản [V2] và có git_repos
                    if "[v2]" in c_name_lower:
                        score += 25
                    if course.get("git_repos"):
                        score += 15

            # Tiêu chí 3: Trùng tiền tố hoặc tên môn học
            prefix = c_name_lower.split(":")[0].strip()
            if prefix and prefix in search_corpus:
                score += 50
            elif c_name_lower in search_corpus:
                score += 40

            # Tiêu chí 4: Token trùng nhau
            c_words = set(re.findall(r"[a-zA-Z0-9_\-]+", c_name_lower))
            common = words_in_text.intersection(c_words)
            meaningful = common - {"and", "the", "for", "with", "khoa", "hoc", "lop", "mon", "level"}
            score += len(meaningful) * 8

            if score > 0:
                scored_courses.append((score, course))

        scored_courses.sort(key=lambda x: x[0], reverse=True)

        if scored_courses:
            selected = [item[1] for item in scored_courses[:max_candidates]]
            return selected

        return all_courses[:max_candidates]


course_knowledge_service = CourseKnowledgeService()
