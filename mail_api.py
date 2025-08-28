#!/usr/bin/env python3
"""
Microsoft邮件处理脚本
用于批量管理Microsoft账号的邮件
支持批量导入账户和前端界面
基于FastAPI的现代化异步实现
使用IMAP协议访问邮件（参考exp.py的成功实现）
"""

import asyncio
import json
import logging
import time
import os
from datetime import datetime
from typing import Dict, List, Optional, Union
from pathlib import Path
import imaplib
import email
from email.header import decode_header
from email import utils as email_utils
import requests
import threading
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

# 移除代理相关代码，以兼容Docker环境

# ============================================================================
# 数据模型 (Pydantic)
# ============================================================================

class EmailVerifyRequest(BaseModel):
    email: EmailStr

class EmailListRequest(BaseModel):
    email: EmailStr
    top: int = 20

class EmailDetailRequest(BaseModel):
    email: EmailStr
    message_id: str

class ApiResponse(BaseModel):
    success: bool
    message: str = ""
    data: Optional[Union[Dict, List]] = None

class AccountCredentials(BaseModel):
    email: EmailStr
    password: str
    client_id: str
    refresh_token: str

class ImportAccountData(BaseModel):
    """单个导入账户数据模型"""
    email: EmailStr
    password: str = ""
    client_id: str = ""
    refresh_token: str

class ImportRequest(BaseModel):
    """批量导入请求模型"""
    accounts: List[ImportAccountData]
    merge_mode: str = "update"  # "update": 更新现有账户, "skip": 跳过重复账户, "replace": 替换所有数据

class ImportResult(BaseModel):
    """导入结果模型"""
    success: bool
    total_count: int
    added_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    details: List[Dict[str, str]]  # 详细信息
    message: str

class AdminTokenRequest(BaseModel):
    """管理令牌验证请求"""
    token: str

class DeleteAccountRequest(BaseModel):
    """删除账户请求"""
    email: EmailStr

class TempAccountRequest(BaseModel):
    """临时账户请求"""
    email: EmailStr
    password: str = ""
    client_id: str = ""
    refresh_token: str
    top: int = 20

class TempMessageDetailRequest(BaseModel):
    """临时账户邮件详情请求"""
    email: EmailStr
    password: str = ""
    client_id: str = ""
    refresh_token: str
    message_id: str

# ============================================================================
# 配置常量
# ============================================================================

# 使用exp.py中验证有效的CLIENT_ID
CLIENT_ID = 'dbc8e03a-b00c-46bd-ae65-b683e7707cb0'
TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
IMAP_SERVER = 'outlook.live.com'
IMAP_PORT = 993
INBOX_FOLDER_NAME = "INBOX"
JUNK_FOLDER_NAME = "Junk"

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 管理认证配置
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', 'admin123')  # 从环境变量获取，默认为admin123

# ============================================================================
# 辅助函数
# ============================================================================

def decode_header_value(header_value):
    """解码邮件头部信息（来自exp.py）"""
    if header_value is None: 
        return ""
    decoded_string = ""
    try:
        parts = decode_header(str(header_value))
        for part, charset in parts:
            if isinstance(part, bytes):
                try: 
                    decoded_string += part.decode(charset if charset else 'utf-8', 'replace')
                except LookupError: 
                    decoded_string += part.decode('utf-8', 'replace')
            else: 
                decoded_string += str(part)
    except Exception:
        if isinstance(header_value, str): 
            return header_value
        try: 
            return str(header_value, 'utf-8', 'replace') if isinstance(header_value, bytes) else str(header_value)
        except: 
            return "[Header Decode Error]"
    return decoded_string

def verify_admin_token(token: str) -> bool:
    """验证管理令牌"""
    return token == ADMIN_TOKEN

def get_admin_token(authorization: Optional[str] = Header(None)) -> str:
    """获取并验证管理令牌"""
    if not authorization:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="无效的认证格式")
    
    token = authorization[7:]  # 移除 "Bearer " 前缀
    
    if not verify_admin_token(token):
        raise HTTPException(status_code=401, detail="无效的管理令牌")
    
    return token

async def load_accounts_config() -> Dict[str, Dict[str, str]]:
    """从配置文件加载批量账户信息（异步版本）"""
    def _sync_load():
        accounts = {}
        try:
            with open('config.txt', 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
            for line in lines:
                line = line.strip()
                # 跳过注释和空行
                if line.startswith('#') or not line:
                    continue
                    
                # 解析格式：用户名----密码----client_id----refresh_token
                # 但现在我们只需要用户名和refresh_token，使用固定的CLIENT_ID
                parts = line.split('----')
                if len(parts) >= 4:  # 至少需要4个部分
                    email, password, client_id, refresh_token = parts[0], parts[1], parts[2], parts[3]
                    accounts[email.strip()] = {
                        'password': password.strip(),
                        'refresh_token': refresh_token.strip()
                        # 不再存储client_id，使用全局的CLIENT_ID
                    }
                elif len(parts) == 2:  # 兼容旧格式：邮箱----refresh_token
                    email, refresh_token = parts
                    accounts[email.strip()] = {
                        'password': '',  # 旧格式没有密码
                        'refresh_token': refresh_token.strip()
                    }
                    
        except FileNotFoundError:
            logger.warning("配置文件不存在")
        except Exception as e:
            logger.error(f"加载配置文件失败: {e}")
            
        return accounts
    
    # 在线程池中执行同步操作
    return await asyncio.to_thread(_sync_load)

async def save_accounts_config(accounts: Dict[str, Dict[str, str]]) -> bool:
    """保存账户信息到配置文件（异步版本）"""
    def _sync_save():
        try:
            # 先读取现有的注释和头部信息
            header_lines = []
            if Path('config.txt').exists():
                with open('config.txt', 'r', encoding='utf-8') as f:
                    for line in f:
                        stripped = line.strip()
                        if stripped.startswith('#') or not stripped:
                            header_lines.append(line.rstrip())
                        else:
                            break  # 遇到第一个非注释行就停止
            
            # 如果没有头部注释，添加默认的
            if not header_lines:
                header_lines = [
                    '# 批量邮箱账户配置文件',
                    '# 格式：用户名----密码----client_id----refresh_token',
                    '# 每行一个账户，用----分隔各字段',
                    ''
                ]
            
            # 写入新的配置文件
            with open('config.txt', 'w', encoding='utf-8') as f:
                # 写入头部注释
                for line in header_lines:
                    f.write(line + '\n')
                
                # 写入账户信息
                for email, info in accounts.items():
                    password = info.get('password', '')
                    refresh_token = info.get('refresh_token', '')
                    # 使用全局固定的CLIENT_ID
                    line = f"{email}----{password}----{CLIENT_ID}----{refresh_token}"
                    f.write(line + '\n')
            
            return True
        except Exception as e:
            logger.error(f"保存配置文件失败: {e}")
            return False
    
    return await asyncio.to_thread(_sync_save)

async def merge_accounts_data(existing_accounts: Dict[str, Dict[str, str]], 
                             new_accounts: List[ImportAccountData], 
                             merge_mode: str = "update") -> ImportResult:
    """合并账户数据
    
    Args:
        existing_accounts: 现有账户数据
        new_accounts: 新导入的账户数据
        merge_mode: 合并模式（update/skip/replace）
        
    Returns:
        ImportResult: 导入结果
    """
    result = ImportResult(
        success=True,
        total_count=len(new_accounts),
        added_count=0,
        updated_count=0,
        skipped_count=0,
        error_count=0,
        details=[],
        message=""
    )
    
    if merge_mode == "replace":
        # 替换模式：清空现有数据
        existing_accounts.clear()
        result.details.append({"action": "clear", "message": "清空现有账户数据"})
    
    for account_data in new_accounts:
        try:
            email = account_data.email
            new_info = {
                'password': account_data.password or '',
                'refresh_token': account_data.refresh_token
            }
            
            if email in existing_accounts:
                if merge_mode == "skip":
                    # 跳过模式：不更新现有账户
                    result.skipped_count += 1
                    result.details.append({
                        "email": email, 
                        "action": "skipped", 
                        "message": "账户已存在，跳过更新"
                    })
                else:
                    # 更新模式：更新现有账户
                    existing_accounts[email] = new_info
                    result.updated_count += 1
                    result.details.append({
                        "email": email, 
                        "action": "updated", 
                        "message": "更新账户信息"
                    })
            else:
                # 新增账户
                existing_accounts[email] = new_info
                result.added_count += 1
                result.details.append({
                    "email": email, 
                    "action": "added", 
                    "message": "新增账户"
                })
                
        except Exception as e:
            result.error_count += 1
            result.details.append({
                "email": getattr(account_data, 'email', 'unknown'), 
                "action": "error", 
                "message": f"处理失败: {str(e)}"
            })
            logger.error(f"处理账户数据失败: {e}")
    
    # 生成结果消息
    if result.error_count > 0:
        result.success = False
        result.message = f"导入完成，但有 {result.error_count} 个错误"
    else:
        result.message = f"导入成功：新增 {result.added_count} 个，更新 {result.updated_count} 个，跳过 {result.skipped_count} 个"
    
    return result

# ============================================================================
# OAuth2令牌获取模块（异步版本）
# ============================================================================

async def get_access_token(refresh_token: str, check_only: bool = False) -> Optional[str]:
    """使用refresh_token获取access_token（参考exp.py的实现）
    
    Args:
        refresh_token: 刷新令牌
        check_only: 如果为True，验证失败时返回None而不是抛出异常
        
    Returns:
        成功返回access_token，如果check_only=True且验证失败则返回None
    """
    logger.info("正在获取新的 access_token...")
    
    data = {
        'client_id': CLIENT_ID,
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'scope': 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access'
    }
    
    try:
        # 使用requests而不是httpx，因为exp.py验证有效
        response = requests.post(TOKEN_URL, data=data)
        response.raise_for_status()
        
        token_data = response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            error_msg = f"获取 access_token 失败: {token_data.get('error_description', '响应中未找到 access_token')}"
            logger.error(error_msg)
            if check_only:
                return None
            raise HTTPException(status_code=401, detail=error_msg)
        
        new_refresh_token = token_data.get('refresh_token')
        if new_refresh_token and new_refresh_token != refresh_token:
            logger.info("提示: refresh_token 已被服务器更新。")
        
        logger.info("成功获取 access_token。")
        return access_token
    
    except requests.exceptions.HTTPError as http_err:
        logger.error(f"请求 access_token 时发生HTTP错误: {http_err}")
        if http_err.response is not None:
            logger.error(f"服务器响应: {http_err.response.status_code} - {http_err.response.text}")
        
        if check_only:
            return None
        raise HTTPException(status_code=401, detail="Refresh token已过期或无效，需要重新获取授权")
    
    except requests.exceptions.RequestException as e:
        logger.error(f"请求 access_token 时发生网络错误: {e}")
        if check_only:
            return None
        raise HTTPException(status_code=500, detail="Token acquisition failed")
    
    except Exception as e:
        logger.error(f"解析 access_token 响应时出错: {e}")
        if check_only:
            return None
        raise HTTPException(status_code=500, detail="Token acquisition failed")

class EmailClient:
    def __init__(self, email: str, account_info: Dict):
        """初始化邮件客户端（基于IMAP协议，按需连接模式）
        
        Args:
            email: 邮箱地址
            account_info: 包含refresh_token的账户信息
        """
        self.email = email
        self.refresh_token = account_info['refresh_token']
        self.access_token = ''
        self.expires_at = 0
        
        # 移除IMAP连接相关的持久化状态
        # 改为按需连接，用完即关闭的模式
        
        # 添加并发控制锁（仅用于token管理）
        self._token_lock = asyncio.Lock()
        
        logger.info(f"EmailClient初始化完成 ({email})，采用按需连接策略")
    
    def is_token_expired(self) -> bool:
        """检查access token是否过期或即将过期"""
        buffer_time = 300  # 5分钟缓冲时间
        return datetime.now().timestamp() + buffer_time >= self.expires_at
    
    async def ensure_token_valid(self):
        """确保token有效（异步版本，带并发控制）"""
        async with self._token_lock:
            if not self.access_token or self.is_token_expired():
                logger.info(f"{self.email} access token已过期或不存在，需要刷新")
                await self.refresh_access_token()
    
    async def refresh_access_token(self) -> None:
        """刷新访问令牌（异步版本）"""
        try:
            logger.info(f"正在为 {self.email} 刷新access token...")
            access_token = await get_access_token(self.refresh_token)
            
            if access_token:
                self.access_token = access_token
                self.expires_at = time.time() + 3600  # 默认1小时过期
                expires_at_str = datetime.fromtimestamp(self.expires_at).strftime('%Y-%m-%d %H:%M:%S')
                logger.info(f"{self.email} access token刷新成功，过期时间: {expires_at_str}")
            else:
                raise HTTPException(status_code=401, detail="Failed to refresh access token")
                
        except Exception as e:
            logger.error(f"刷新访问令牌失败 {self.email}: {e}")
            raise
    
    async def create_imap_connection(self, mailbox_to_select=INBOX_FOLDER_NAME):
        """创建IMAP连接（按需创建，带超时和重试）"""
        # 确保token有效
        await self.ensure_token_valid()
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"正在为 {self.email} 创建IMAP连接到 {mailbox_to_select}... (第{attempt+1}次尝试)")
                
                def _sync_connect():
                    imap_conn = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
                    auth_string = f"user={self.email}\1auth=Bearer {self.access_token}\1\1"
                    logger.info(f"正在为 {self.email} 使用 XOAUTH2 进行认证...")
                    typ, data = imap_conn.authenticate('XOAUTH2', lambda x: auth_string.encode('utf-8'))
                    
                    if typ == 'OK':
                        logger.info(f"IMAP XOAUTH2 认证成功 ({self.email})。")
                        # 选择邮箱
                        stat_select, data_select = imap_conn.select(mailbox_to_select, readonly=True)
                        if stat_select == 'OK':
                            return imap_conn
                        else:
                            error_msg = data_select[0].decode('utf-8', 'replace') if data_select and data_select[0] else "未知错误"
                            raise Exception(f"选择邮箱 '{mailbox_to_select}' 失败: {error_msg}")
                    else:
                        error_message = data[0].decode('utf-8', 'replace') if data and data[0] else "未知认证错误"
                        raise Exception(f"IMAP XOAUTH2 认证失败: {error_message} (Type: {typ})")
                
                # 在线程池中执行，带10秒超时
                imap_conn = await asyncio.wait_for(
                    asyncio.to_thread(_sync_connect), timeout=10.0
                )
                logger.info(f"成功创建IMAP连接 ({self.email})")
                return imap_conn
                
            except asyncio.TimeoutError:
                logger.error(f"创建IMAP连接超时 ({self.email}), 第{attempt+1}次尝试")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)  # 等待1秒后重试
                    continue
            except Exception as e:
                logger.error(f"创建IMAP连接失败 ({self.email}), 第{attempt+1}次尝试: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)  # 等待1秒后重试
                    continue
        
        logger.error(f"经过{max_retries}次尝试，仍无法创建IMAP连接 ({self.email})")
        raise HTTPException(status_code=500, detail=f"Failed to connect to IMAP server for {self.email}")
    
    def close_imap_connection(self, imap_conn):
        """安全关闭IMAP连接"""
        if imap_conn:
            try:
                logger.info(f"正在关闭IMAP连接 ({self.email})...")
                current_state = getattr(imap_conn, 'state', None)
                
                # 安全关闭连接，忽略可能的EOF错误
                try:
                    if current_state == 'SELECTED':
                        imap_conn.close()
                except Exception as e:
                    logger.debug(f"关闭邮箱时出现预期错误 ({self.email}): {e}")
                
                try:
                    if current_state != 'LOGOUT':
                        imap_conn.logout()
                except Exception as e:
                    logger.debug(f"登出时出现预期错误 ({self.email}): {e}")
                
                logger.info(f"IMAP连接已安全关闭 ({self.email})")
            except Exception as e:
                logger.debug(f"关闭IMAP连接时发生预期错误 ({self.email}): {e}")
                # 这些错误是正常的，不需要记录为ERROR级别

    async def get_messages(self, folder_id: str = INBOX_FOLDER_NAME, top: int = 10) -> List[Dict]:
        """获取指定文件夹的邮件（使用IMAP协议，按需连接模式）
        
        Args:
            folder_id: 文件夹ID, 默认为'INBOX'
            top: 获取的邮件数量
        """
        logger.info(f"正在为 {self.email} 获取邮件列表（文件夹: {folder_id}, 数量: {top}）")
        
        # 创建临时IMAP连接
        imap_conn = None
        try:
            imap_conn = await self.create_imap_connection(folder_id)
            
            def _sync_get_messages():
                # 搜索所有邮件
                typ, uid_data = imap_conn.uid('search', None, "ALL")
                if typ != 'OK':
                    raise Exception(f"在 '{folder_id}' 中搜索邮件失败 (status: {typ})。")
                
                if not uid_data[0]:
                    return []
                
                uids = uid_data[0].split()
                logger.info(f"{folder_id} 共有 {len(uids)} 封邮件")
                
                # 只获取最新的top条邮件
                uids = uids[-top:] if len(uids) > top else uids
                uids.reverse()  # 最新的在前
                
                messages = []
                for uid_bytes in uids:
                    try:
                        # 获取邮件头部信息
                        typ, msg_data = imap_conn.uid('fetch', uid_bytes, 
                                                     '(BODY.PEEK[HEADER.FIELDS (SUBJECT DATE FROM)] INTERNALDATE)')
                        
                        if typ == 'OK' and msg_data:
                            subject_str = "(No Subject)"
                            from_name = "(Unknown)"
                            from_email = ""
                            date_str = "(No Date)"
                            
                            # 解析邮件头部
                            header_content_bytes = None
                            if isinstance(msg_data[0], tuple) and len(msg_data[0]) == 2:
                                if isinstance(msg_data[0][1], bytes):
                                    header_content_bytes = msg_data[0][1]
                            
                            if header_content_bytes:
                                header_message = email.message_from_bytes(header_content_bytes)
                                subject_str = decode_header_value(header_message.get('Subject', '(No Subject)'))
                                from_str = decode_header_value(header_message.get('From', '(Unknown Sender)'))
                                date_header_str = header_message.get('Date')
                                
                                # 解析From字段
                                if '<' in from_str and '>' in from_str:
                                    from_name = from_str.split('<')[0].strip().strip('"')
                                    from_email = from_str.split('<')[1].split('>')[0].strip()
                                else:
                                    from_email = from_str.strip()
                                    if '@' in from_email:
                                        from_name = from_email.split('@')[0]
                                
                                # 解析日期
                                if date_header_str:
                                    try:
                                        dt_obj = email_utils.parsedate_to_datetime(date_header_str)
                                        if dt_obj:
                                            date_str = dt_obj.strftime('%Y-%m-%d %H:%M:%S')
                                    except Exception:
                                        date_str = date_header_str[:25] if date_header_str else "(No Date)"
                            
                            # 构建邮件信息（兼容前端格式）
                            message = {
                                'id': uid_bytes.decode('utf-8'),
                                'subject': subject_str,
                                'receivedDateTime': date_str,
                                'sender': {
                                    'emailAddress': {
                                        'address': from_email,
                                        'name': from_name
                                    }
                                },
                                'from': {  # 兼容字段
                                    'emailAddress': {
                                        'address': from_email,
                                        'name': from_name
                                    }
                                },
                                'body': {
                                    'content': '',
                                    'contentType': 'text'
                                },
                                'bodyPreview': ''
                            }
                            messages.append(message)
                            
                    except Exception as e:
                        logger.error(f"处理邮件UID {uid_bytes}时出错: {e}")
                        continue
                
                return messages
            
            # 在线程池中执行同步IMAP操作
            messages = await asyncio.to_thread(_sync_get_messages)
            
            logger.info(f"成功获取 {self.email} 的 {len(messages)} 封邮件")
            return messages
            
        except asyncio.CancelledError:
            logger.warning(f"获取邮件操作被取消 ({self.email})")
            raise
        except Exception as e:
            logger.error(f"获取邮件失败 {self.email}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve emails")
        finally:
            # 确保连接被关闭
            if imap_conn:
                self.close_imap_connection(imap_conn)

    async def get_message_detail(self, message_id: str) -> Dict:
        """获取邮件详情（使用IMAP协议，按需连接模式）"""
        logger.info(f"正在为 {self.email} 获取邮件详情: {message_id}")
        
        # 创建临时IMAP连接
        imap_conn = None
        try:
            imap_conn = await self.create_imap_connection()
            
            def _sync_get_detail():
                message_uid = message_id.encode('utf-8') if isinstance(message_id, str) else message_id
                typ, msg_data = imap_conn.uid('fetch', message_uid, '(RFC822)')
                
                if typ == 'OK' and msg_data and msg_data[0] is not None:
                    raw_email_bytes = None
                    if isinstance(msg_data[0], tuple) and len(msg_data[0]) == 2:
                        raw_email_bytes = msg_data[0][1]
                    
                    if raw_email_bytes:
                        email_message = email.message_from_bytes(raw_email_bytes)
                        subject = decode_header_value(email_message['Subject']) or "(No Subject)"
                        from_ = decode_header_value(email_message['From']) or "(Unknown Sender)"
                        to_ = decode_header_value(email_message['To']) or "(Unknown Recipient)"
                        date_ = email_message['Date'] or "(Unknown Date)"
                        
                        # 解析邮件正文，优先获取HTML格式
                        body_content = ""
                        body_type = "text"
                        
                        if email_message.is_multipart():
                            # 优先查找HTML部分
                            html_content = None
                            text_content = None
                            
                            for part in email_message.walk():
                                content_type = part.get_content_type()
                                content_disposition = str(part.get("Content-Disposition"))
                                
                                if 'attachment' not in content_disposition.lower():
                                    try:
                                        charset = part.get_content_charset() or 'utf-8'
                                        payload = part.get_payload(decode=True)
                                        
                                        if content_type == 'text/html' and not html_content:
                                            html_content = payload.decode(charset, errors='replace')
                                        elif content_type == 'text/plain' and not text_content:
                                            text_content = payload.decode(charset, errors='replace')
                                    except Exception:
                                        continue
                            
                            # 优先使用HTML内容
                            if html_content:
                                body_content = html_content
                                body_type = "html"
                            elif text_content:
                                body_content = text_content
                                body_type = "text"
                            else:
                                body_content = "[未找到可读的邮件内容]"
                        else:
                            # 非多部分邮件
                            try:
                                charset = email_message.get_content_charset() or 'utf-8'
                                payload = email_message.get_payload(decode=True)
                                body_content = payload.decode(charset, errors='replace')
                                
                                # 检查是否为HTML内容
                                if '<html' in body_content.lower() or '<body' in body_content.lower():
                                    body_type = "html"
                            except Exception:
                                body_content = "[Failed to decode email body]"
                        
                        if not body_content:
                            body_content = "[未找到可读的文本内容]"
                        
                        return {
                            'id': message_id,
                            'subject': subject,
                            'sender': {'emailAddress': {'address': from_.strip(), 'name': from_.strip()}},
                            'toRecipients': [{'emailAddress': {'address': to_.strip(), 'name': to_.strip()}}],
                            'receivedDateTime': date_,
                            'body': {'content': body_content, 'contentType': body_type}
                        }
                    else:
                        raise Exception("未能提取邮件数据")
                else:
                    raise Exception(f"获取邮件失败: {typ}")
            
            result = await asyncio.to_thread(_sync_get_detail)
            logger.info(f"成功获取 {self.email} 的邮件详情")
            return result
            
        except asyncio.CancelledError:
            logger.warning(f"获取邮件详情操作被取消 ({self.email})")
            raise
        except Exception as e:
            logger.error(f"获取邮件详情失败 {self.email}: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve email details")
        finally:
            # 确保连接被关闭
            if imap_conn:
                self.close_imap_connection(imap_conn)

    async def cleanup(self):
        """清理资源（新模式下不再需要清理持久化连接）"""
        # 在新的按需连接模式下，不需要特别的清理操作
        # 因为每次操作后都会自动关闭连接
        logger.info(f"EmailClient清理完成 ({self.email})，按需连接模式无需额外清理")

    def __del__(self):
        """析构函数（新模式下不需要特别处理）"""
        # 新模式下不需要特别的清理操作
        pass

class EmailManager:
    """邮件管理器，负责管理多个邮箱账户（异步版本，支持并发及资源优化）"""
    
    def __init__(self):
        self.clients = {}
        self._accounts = None
        # 延迟初始化锁，在需要时创建
        self._clients_lock = None
        # 移除清理任务相关的属性，因为不再需要连接保活
        
    async def _load_accounts(self):
        """加载账户配置（懒加载）"""
        if self._accounts is None:
            self._accounts = await load_accounts_config()
        return self._accounts
        
    async def get_client(self, email: str) -> Optional[EmailClient]:
        """获取指定邮箱的客户端（带并发控制）"""
        # 确保锁已初始化
        if self._clients_lock is None:
            self._clients_lock = asyncio.Lock()
            
        async with self._clients_lock:
            accounts = await load_accounts_config()
            if email not in accounts:
                return None
                
            if email not in self.clients:
                self.clients[email] = EmailClient(email, accounts[email])
                
            return self.clients[email]
    
    async def verify_email(self, email: str) -> bool:
        """验证邮箱是否存在于配置中"""
        accounts = await load_accounts_config()
        return email in accounts
    
    async def get_messages(self, email: str, top: int = 10) -> List[Dict]:
        """获取指定邮箱的邮件列表"""
        client = await self.get_client(email)
        if not client:
            raise HTTPException(status_code=404, detail=f"邮箱 {email} 未在配置中找到")
        
        try:
            return await client.get_messages(top=top)
        except HTTPException as e:
            # 检查是否是refresh token过期问题
            if "refresh token" in e.detail.lower() or "token" in e.detail.lower():
                raise HTTPException(
                    status_code=401, 
                    detail=f"邮箱 {email} 的 Refresh Token 已过期。请使用 get_refresh_token.py 重新获取授权，然后更新 config.txt 中的 refresh_token。"
                )
            raise
    
    async def get_message_detail(self, email: str, message_id: str) -> Dict:
        """获取指定邮箱的邮件详情"""
        client = await self.get_client(email)
        if not client:
            raise HTTPException(status_code=404, detail=f"邮箱 {email} 未在配置中找到")
        
        return await client.get_message_detail(message_id)
    
    async def cleanup_all(self):
        """清理所有资源（新模式下简化处理）"""
        try:
            # 新模式下不需要特别的连接清理
            # 因为每次操作后都会自动关闭连接
            if self._clients_lock:
                async with self._clients_lock:
                    for email, client in self.clients.items():
                        try:
                            logger.info(f"清理客户端: {email}")
                            await client.cleanup()
                        except Exception as e:
                            logger.error(f"清理客户端失败 ({email}): {e}")
                    
                    self.clients.clear()
                    logger.info("所有客户端已清理完毕")
                
        except Exception as e:
            logger.error(f"清理资源时出错: {e}")

# ============================================================================
# FastAPI应用和API端点
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用程序生命周期管理"""
    # 启动时的初始化
    logger.info("启动邮件管理系统...")
    yield
    # 关闭时的清理
    logger.info("正在关闭邮件管理系统...")
    try:
        # 使用新的清理方法
        await email_manager.cleanup_all()
    except Exception as e:
        logger.error(f"清理系统资源时出错: {e}")
    logger.info("邮件管理系统已关闭")

app = FastAPI(
    title="Outlook邮件管理系统",
    description="基于FastAPI的现代化异步邮件管理服务",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件服务
app.mount("/static", StaticFiles(directory="static"), name="static")

# 创建邮件管理器实例
email_manager = EmailManager()

@app.get("/")
async def root():
    """根路径 - 返回前端页面"""
    return FileResponse("static/index.html")

# CSS和JS文件的直接路由
@app.get("/style.css")
async def style_css():
    """CSS文件"""
    return FileResponse("static/style.css")

@app.get("/script.js")
async def script_js():
    """JavaScript文件"""
    return FileResponse("static/script.js")

@app.get("/admin")
async def admin_page():
    """管理页面"""
    return FileResponse("static/admin.html")

@app.get("/admin.js")
async def admin_js():
    """管理页面JavaScript文件"""
    return FileResponse("static/admin.js")

@app.get("/api/messages")
async def get_messages(email: str, top: int = 20) -> ApiResponse:
    """获取邮件列表"""
    email = email.strip()
    
    if not email:
        return ApiResponse(success=False, message="请提供邮箱地址")
    
    try:
        messages = await email_manager.get_messages(email, top)
        return ApiResponse(success=True, data=messages)
    except HTTPException as e:
        return ApiResponse(success=False, message=e.detail)
    except Exception as e:
        logger.error(f"获取邮件列表失败: {e}")
        return ApiResponse(success=False, message="获取邮件列表失败")

@app.get("/api/message/{message_id}")
async def get_message_detail(message_id: str, email: str) -> ApiResponse:
    """获取邮件详情"""
    email = email.strip()
    
    if not email:
        return ApiResponse(success=False, message="请提供邮箱地址")
    
    try:
        message = await email_manager.get_message_detail(email, message_id)
        return ApiResponse(success=True, data=message)
    except HTTPException as e:
        return ApiResponse(success=False, message=e.detail)
    except Exception as e:
        logger.error(f"获取邮件详情失败: {e}")
        return ApiResponse(success=False, message="获取邮件详情失败")

@app.post("/api/temp-messages")
async def get_temp_messages(request: TempAccountRequest) -> ApiResponse:
    """使用临时账户获取邮件列表"""
    try:
        # 创建临时邮件客户端
        account_info = {
            'password': request.password,
            'refresh_token': request.refresh_token
        }
        
        # 使用指定的client_id或默认值
        if request.client_id:
            # 暂存原始CLIENT_ID
            original_client_id = globals().get('CLIENT_ID')
            globals()['CLIENT_ID'] = request.client_id
        
        temp_client = EmailClient(request.email, account_info)
        
        try:
            # 获取邮件
            messages = await temp_client.get_messages(top=request.top)
            return ApiResponse(success=True, data=messages)
        finally:
            # 清理临时客户端
            await temp_client.cleanup()
            
            # 恢复原始CLIENT_ID
            if request.client_id and 'original_client_id' in locals():
                globals()['CLIENT_ID'] = original_client_id
                
    except HTTPException as e:
        return ApiResponse(success=False, message=e.detail)
    except Exception as e:
        logger.error(f"临时账户获取邮件失败: {e}")
        return ApiResponse(success=False, message=f"获取邮件失败: {str(e)}")

@app.post("/api/temp-message-detail")
async def get_temp_message_detail(request: TempMessageDetailRequest) -> ApiResponse:
    """使用临时账户获取邮件详情"""
    try:
        # 创建临时邮件客户端
        account_info = {
            'password': request.password,
            'refresh_token': request.refresh_token
        }
        
        # 使用指定的client_id或默认值
        if request.client_id:
            # 暂存原始CLIENT_ID
            original_client_id = globals().get('CLIENT_ID')
            globals()['CLIENT_ID'] = request.client_id
        
        temp_client = EmailClient(request.email, account_info)
        
        try:
            # 获取邮件详情
            message_detail = await temp_client.get_message_detail(request.message_id)
            return ApiResponse(success=True, data=message_detail)
        finally:
            # 清理临时客户端
            await temp_client.cleanup()
            
            # 恢复原始CLIENT_ID
            if request.client_id and 'original_client_id' in locals():
                globals()['CLIENT_ID'] = original_client_id
                
    except HTTPException as e:
        return ApiResponse(success=False, message=e.detail)
    except Exception as e:
        logger.error(f"临时账户获取邮件详情失败: {e}")
        return ApiResponse(success=False, message=f"获取邮件详情失败: {str(e)}")

@app.get("/api/accounts")
async def get_accounts(authorization: Optional[str] = Header(None)) -> ApiResponse:
    """获取所有账户列表（可选管理认证）"""
    try:
        # 检查是否提供了管理认证
        is_admin = False
        if authorization and authorization.startswith("Bearer "):
            token = authorization[7:]
            is_admin = verify_admin_token(token)
        
        accounts = await load_accounts_config()
        # 只返回邮箱地址，不包含敏感信息
        account_list = [{"email": email} for email in accounts.keys()]
        return ApiResponse(success=True, data=account_list, message=f"共 {len(account_list)} 个账户")
    except Exception as e:
        logger.error(f"获取账户列表失败: {e}")
        return ApiResponse(success=False, message="获取账户列表失败")

@app.post("/api/import")
async def import_accounts(request: ImportRequest) -> ImportResult:
    """批量导入邮箱账户"""
    try:
        # 加载现有账户
        existing_accounts = await load_accounts_config()
        
        # 合并数据
        result = await merge_accounts_data(existing_accounts, request.accounts, request.merge_mode)
        
        # 保存更新后的数据
        if result.success and (result.added_count > 0 or result.updated_count > 0):
            save_success = await save_accounts_config(existing_accounts)
            if not save_success:
                result.success = False
                result.message += "，但保存文件失败"
                
        return result
        
    except Exception as e:
        logger.error(f"导入账户失败: {e}")
        return ImportResult(
            success=False,
            total_count=len(request.accounts) if hasattr(request, 'accounts') else 0,
            added_count=0,
            updated_count=0,
            skipped_count=0,
            error_count=len(request.accounts) if hasattr(request, 'accounts') else 0,
            details=[{"action": "error", "message": f"系统错误: {str(e)}"}],
            message=f"导入失败: {str(e)}"
        )

# ============================================================================
# 管理API端点
# ============================================================================

@app.post("/api/admin/verify")
async def verify_admin_token_endpoint(request: AdminTokenRequest) -> ApiResponse:
    """验证管理令牌"""
    try:
        is_valid = verify_admin_token(request.token)
        if is_valid:
            return ApiResponse(success=True, message="令牌验证成功")
        else:
            return ApiResponse(success=False, message="无效的管理令牌")
    except Exception as e:
        logger.error(f"令牌验证失败: {e}")
        return ApiResponse(success=False, message="验证失败")

@app.delete("/api/admin/accounts")
async def delete_account(request: DeleteAccountRequest, token: str = Depends(get_admin_token)) -> ApiResponse:
    """删除指定账户"""
    try:
        # 加载现有账户
        accounts = await load_accounts_config()
        
        if request.email not in accounts:
            return ApiResponse(success=False, message=f"账户 {request.email} 不存在")
        
        # 删除账户
        del accounts[request.email]
        
        # 保存更新后的数据
        save_success = await save_accounts_config(accounts)
        
        if save_success:
            # 清理相关的客户端连接
            if request.email in email_manager.clients:
                try:
                    await email_manager.clients[request.email].cleanup()
                    del email_manager.clients[request.email]
                except Exception as e:
                    logger.warning(f"清理客户端连接失败 ({request.email}): {e}")
            
            return ApiResponse(success=True, message=f"账户 {request.email} 删除成功")
        else:
            return ApiResponse(success=False, message="保存配置文件失败")
            
    except Exception as e:
        logger.error(f"删除账户失败: {e}")
        return ApiResponse(success=False, message=f"删除失败: {str(e)}")

@app.get("/api/admin/export")
async def export_accounts(token: str = Depends(get_admin_token)) -> ApiResponse:
    """导出账户配置（包含完整信息）"""
    try:
        # 加载现有账户
        accounts = await load_accounts_config()
        
        if not accounts:
            return ApiResponse(success=False, message="暂无账户数据")
        
        # 生成导出内容
        export_lines = []
        export_lines.append("# Outlook邮件系统账号配置文件")
        export_lines.append(f"# 导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        export_lines.append("# 格式: 邮箱----密码----client_id----refresh_token")
        export_lines.append("# 注意：请妄善保管此文件，包含敏感信息")
        export_lines.append("")
        
        # 添加账户数据
        for email, account_info in accounts.items():
            password = account_info.get('password', '')
            refresh_token = account_info.get('refresh_token', '')
            # 使用全局CLIENT_ID
            line = f"{email}----{password}----{CLIENT_ID}----{refresh_token}"
            export_lines.append(line)
        
        export_content = "\n".join(export_lines)
        
        return ApiResponse(
            success=True, 
            data=export_content,
            message=f"成功导出 {len(accounts)} 个账户的完整配置"
        )
        
    except Exception as e:
        logger.error(f"导出账户配置失败: {e}")
        return ApiResponse(success=False, message=f"导出失败: {str(e)}")

@app.post("/api/parse-import-text")
async def parse_import_text(request: dict) -> ApiResponse:
    """解析导入文本格式数据"""
    try:
        import_text = request.get('text', '').strip()
        if not import_text:
            return ApiResponse(success=False, message="请提供要导入的文本数据")
        
        accounts = []
        errors = []
        
        lines = import_text.split('\n')
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
                
            try:
                # 解析格式：用户名----密码----client_id----refresh_token
                parts = line.split('----')
                if len(parts) >= 4:
                    email, password, client_id, refresh_token = parts[0], parts[1], parts[2], parts[3]
                    accounts.append({
                        "email": email.strip(),
                        "password": password.strip(),
                        "client_id": client_id.strip(),
                        "refresh_token": refresh_token.strip()
                    })
                elif len(parts) == 2:  # 兼容旧格式：邮箱----refresh_token
                    email, refresh_token = parts
                    accounts.append({
                        "email": email.strip(),
                        "password": "",
                        "client_id": CLIENT_ID,
                        "refresh_token": refresh_token.strip()
                    })
                else:
                    errors.append(f"第{line_num}行格式错误：{line}")
            except Exception as e:
                errors.append(f"第{line_num}行解析失败：{str(e)}")
        
        result_data = {
            "accounts": accounts,
            "parsed_count": len(accounts),
            "error_count": len(errors),
            "errors": errors
        }
        
        if errors:
            return ApiResponse(
                success=True, 
                data=result_data, 
                message=f"解析完成：成功 {len(accounts)} 条，错误 {len(errors)} 条"
            )
        else:
            return ApiResponse(
                success=True, 
                data=result_data, 
                message=f"解析成功：共 {len(accounts)} 条账户数据"
            )
            
    except Exception as e:
        logger.error(f"解析导入文本失败: {e}")
        return ApiResponse(success=False, message=f"解析失败: {str(e)}")

@app.post("/api/account")
async def add_account(account: ImportAccountData) -> ApiResponse:
    """添加单个账户"""
    try:
        # 加载现有账户
        existing_accounts = await load_accounts_config()
        
        # 检查是否已存在
        if account.email in existing_accounts:
            return ApiResponse(success=False, message=f"账户 {account.email} 已存在")
        
        # 添加新账户
        existing_accounts[account.email] = {
            'password': account.password or '',
            'refresh_token': account.refresh_token
        }
        
        # 保存数据
        save_success = await save_accounts_config(existing_accounts)
        
        if save_success:
            return ApiResponse(success=True, message=f"成功添加账户 {account.email}")
        else:
            return ApiResponse(success=False, message="保存账户数据失败")
            
    except Exception as e:
        logger.error(f"添加账户失败: {e}")
        return ApiResponse(success=False, message=f"添加账户失败: {str(e)}")

@app.put("/api/account/{email}")
async def update_account(email: str, account: ImportAccountData) -> ApiResponse:
    """更新账户信息"""
    try:
        # 加载现有账户
        existing_accounts = await load_accounts_config()
        
        # 检查账户是否存在
        if email not in existing_accounts:
            return ApiResponse(success=False, message=f"账户 {email} 不存在")
        
        # 更新账户信息
        existing_accounts[email] = {
            'password': account.password or existing_accounts[email].get('password', ''),
            'refresh_token': account.refresh_token
        }
        
        # 如果邮箱地址发生变化，需要删除旧的并添加新的
        if email != account.email:
            del existing_accounts[email]
            existing_accounts[account.email] = {
                'password': account.password or '',
                'refresh_token': account.refresh_token
            }
        
        # 保存数据
        save_success = await save_accounts_config(existing_accounts)
        
        if save_success:
            return ApiResponse(success=True, message=f"成功更新账户 {account.email}")
        else:
            return ApiResponse(success=False, message="保存账户数据失败")
            
    except Exception as e:
        logger.error(f"更新账户失败: {e}")
        return ApiResponse(success=False, message=f"更新账户失败: {str(e)}")

@app.delete("/api/account/{email}")
async def delete_account(email: str) -> ApiResponse:
    """删除账户"""
    try:
        # 加载现有账户
        existing_accounts = await load_accounts_config()
        
        # 检查账户是否存在
        if email not in existing_accounts:
            return ApiResponse(success=False, message=f"账户 {email} 不存在")
        
        # 删除账户
        del existing_accounts[email]
        
        # 保存数据
        save_success = await save_accounts_config(existing_accounts)
        
        if save_success:
            return ApiResponse(success=True, message=f"成功删除账户 {email}")
        else:
            return ApiResponse(success=False, message="保存账户数据失败")
            
    except Exception as e:
        logger.error(f"删除账户失败: {e}")
        return ApiResponse(success=False, message=f"删除账户失败: {str(e)}")

@app.get("/api/export")
async def export_accounts(format: str = "txt") -> ApiResponse:
    """导出账户数据"""
    try:
        accounts = await load_accounts_config()
        
        if format.lower() == "json":
            # JSON格式导出
            export_data = {
                "accounts": [
                    {
                        "email": email,
                        "password": info.get('password', ''),
                        "client_id": CLIENT_ID,
                        "refresh_token": info.get('refresh_token', '')
                    }
                    for email, info in accounts.items()
                ],
                "exported_at": datetime.now().isoformat(),
                "total_count": len(accounts)
            }
            
            return ApiResponse(
                success=True, 
                data=export_data, 
                message=f"成功导出JSON格式数据，共 {len(accounts)} 个账户"
            )
            
        else:
            # TXT格式导出
            lines = [
                "# 批量邮箱账户配置文件",
                "# 格式：用户名----密码----client_id----refresh_token",
                "# 每行一个账户，用----分隔各字段",
                ""
            ]
            
            for email, info in accounts.items():
                password = info.get('password', '')
                refresh_token = info.get('refresh_token', '')
                line = f"{email}----{password}----{CLIENT_ID}----{refresh_token}"
                lines.append(line)
            
            export_text = "\n".join(lines)
            
            return ApiResponse(
                success=True, 
                data={"content": export_text, "filename": f"accounts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"}, 
                message=f"成功导出TXT格式数据，共 {len(accounts)} 个账户"
            )
            
    except Exception as e:
        logger.error(f"导出账户数据失败: {e}")
        return ApiResponse(success=False, message=f"导出失败: {str(e)}")

async def main():
    """命令行模式入口（异步版本）"""
    try:
        accounts = await load_accounts_config()
        if not accounts:
            print("没有找到有效的邮箱配置，请检查config.txt文件")
            return
            
        print(f"已加载 {len(accounts)} 个邮箱账户")
        for email in accounts.keys():
            print(f"- {email}")
            
        # 测试第一个账户
        first_email = list(accounts.keys())[0]
        manager = EmailManager()
        
        print(f"\n测试获取 {first_email} 的邮件...")
        messages = await manager.get_messages(first_email, 5)
        
        print(f"\n找到 {len(messages)} 封邮件:")
        for i, msg in enumerate(messages, 1):
            subject = msg.get('subject', '无主题')
            from_addr = msg.get('from', {}).get('emailAddress', {}).get('address', '未知发件人')
            print(f"{i}. {subject} - {from_addr}")
            
    except Exception as e:
        logger.error(f"程序执行出错: {e}")
        raise

if __name__ == '__main__':
    import sys
    import uvicorn
    
    if len(sys.argv) > 1 and sys.argv[1] == 'web':
        # Web模式
        print("启动Web服务器...")
        print("访问 http://localhost:5000 查看前端界面")
        # 不使用reload以避免导入问题
        uvicorn.run(app, host="0.0.0.0", port=5000, log_level="info")
    else:
        # 命令行模式
        asyncio.run(main())