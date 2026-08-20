# backend/app/services/google_drive_service.py
import io
import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from app.core.config import settings

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file"
]

class GoogleDriveService:
    """Quản lý cấu trúc thư mục phân tầng [COF] trên Google Drive theo năm và phả hệ tổ chức."""

    def __init__(self):
        self._service = None

    def _get_drive_service(self):
        if not self._service:
            if not settings.GOOGLE_CREDENTIALS_JSON:
                raise ValueError("Chưa cấu hình GOATED_CREDENTIALS_JSON trong .env")
            
            cred_info = json.loads(settings.GOOGLE_CREDENTIALS_JSON) if isinstance(settings.GOOGLE_CREDENTIALS_JSON, str) else settings.GOOGLE_CREDENTIALS_JSON
            credentials = Credentials.from_service_account_info(cred_info, scopes=SCOPES)
            self._service = build("drive", "v3", credentials=credentials)
        return self._service

    def get_or_create_subfolder(self, parent_folder_id: str, folder_name: str) -> str:
        """Tìm thư mục con theo tên trong parent_folder_id; nếu chưa có thì tạo mới."""
        service = self._get_drive_service()
        query = (
            f"'{parent_folder_id}' in parents and "
            f"name = '{folder_name}' and "
            f"mimeType = 'application/vnd.google-apps.folder' and "
            f"trashed = false"
        )
        results = service.files().list(q=query, fields="files(id, name)", spaces="drive").execute()
        files = results.get("files", [])
        
        if files:
            return files[0]["id"]

        # Nếu chưa có -> Tạo mới
        folder_metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_folder_id]
        }
        folder = service.files().create(body=folder_metadata, fields="id").execute()
        logger.info(f"📁 Đã tạo thư mục mới trên Drive: '{folder_name}' (ID: {folder.get('id')})")
        return folder.get("id")

    def ensure_school_cof_folder(
        self,
        root_folder_id: str,
        country: str,
        distributor_name: str,
        partner_name: str,
        school_name: str,
        year: Optional[str] = None
    ) -> str:
        """
        Dựng chuỗi thư mục phân tầng:
        Root > {Năm} > {Quốc gia} > [Distributor] {Tên} > [Partner] {Tên} > [School] {Tên}
        """
        current_year = year or str(datetime.now().year)
        
        # 1. Thư mục Năm (VD: 2026)
        year_folder_id = self.get_or_create_subfolder(root_folder_id, current_year)
        
        # 2. Thư mục Quốc gia (VD: 4. Vietnam)
        country_folder_name = country if ("." in country or "Vietnam" in country) else f"4. {country}"
        country_folder_id = self.get_or_create_subfolder(year_folder_id, country_folder_name)
        
        # 3. Thư mục Distributor
        dist_folder_name = f"[Distributor] {distributor_name}" if not distributor_name.startswith("[Distributor]") else distributor_name
        dist_folder_id = self.get_or_create_subfolder(country_folder_id, dist_folder_name)
        
        # 4. Thư mục Partner
        partner_folder_name = f"[Partner] {partner_name}" if not partner_name.startswith("[Partner]") else partner_name
        partner_folder_id = self.get_or_create_subfolder(dist_folder_id, partner_folder_name)
        
        # 5. Thư mục School
        school_folder_name = f"[School] {school_name}" if not school_name.startswith("[School]") else school_name
        school_folder_id = self.get_or_create_subfolder(partner_folder_id, school_folder_name)
        
        return school_folder_id

    def upload_file_to_school_folder(
        self,
        local_file_path: str,
        folder_id: str,
        custom_file_name: Optional[str] = None
    ) -> Dict[str, str]:
        """Tải file COF lên thư mục của trường và trả về Web View Link."""
        service = self._get_drive_service()
        file_name = custom_file_name or os.path.basename(local_file_path)
        
        file_metadata = {
            "name": file_name,
            "parents": [folder_id]
        }
        media = MediaFileUpload(
            local_file_path, 
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            resumable=True
        )
        
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, webViewLink"
        ).execute()
        
        logger.info(f"✅ Đã tải file lên Drive thành công: {file_name} -> {uploaded_file.get('webViewLink')}")
        return {
            "file_id": uploaded_file.get("id"),
            "file_name": uploaded_file.get("name"),
            "web_view_link": uploaded_file.get("webViewLink")
        }

google_drive_service = GoogleDriveService()