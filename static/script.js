// Outlook风格邮件管理系统 JavaScript

class EmailManager {
    constructor() {
        this.currentEmail = '';
        this.selectedMessageId = null;
        this.emails = [];
        
        // 临时账户支持
        this.tempAccount = null;
        this.usingTempAccount = false;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupModals();
        
        // 绑定移动端侧边栏事件
        this.bindMobileSidebarEvents();
    }

    bindEvents() {
        // 邮箱表单提交事件（直接获取邮件）
        const emailForm = document.getElementById('emailForm');
        emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.loadEmails();
        });

        // 刷新按钮事件
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadEmails();
            });
        }

        // 导入按钮事件
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.showImportModal();
            });
        }

        // 账户管理按钮事件
        const accountsBtn = document.getElementById('accountsBtn');
        if (accountsBtn) {
            accountsBtn.addEventListener('click', () => {
                this.showAccountsModal();
            });
        }
        
        // 临时账户按钮事件
        const tempAccountBtn = document.getElementById('tempAccountBtn');
        if (tempAccountBtn) {
            tempAccountBtn.addEventListener('click', () => {
                this.showTempAccountModal();
            });
        }

        // 导入相关事件绑定
        this.bindImportEvents();
        
        // 检查是否有保存的临时账户
        this.loadTempAccount();
    }
    
    bindMobileSidebarEvents() {
        // 移动端侧边栏切换按钮
        const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
        const mobileSidebar = document.getElementById('mobileSidebar');
        const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
        const closeSidebar = document.getElementById('closeSidebar');
        
        // 打开侧边栏
        if (mobileSidebarToggle) {
            mobileSidebarToggle.addEventListener('click', () => {
                this.openMobileSidebar();
            });
        }
        
        // 关闭侧边栏
        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }
        
        // 点击遮罩层关闭侧边栏
        if (mobileSidebarOverlay) {
            mobileSidebarOverlay.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }
        
        // 移动端邮箱表单事件
        const mobileEmailForm = document.getElementById('mobileEmailForm');
        if (mobileEmailForm) {
            mobileEmailForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.loadMobileEmails();
            });
        }
        
        // 移动端临时账户按钮
        const mobileTempAccountBtn = document.getElementById('mobileTempAccountBtn');
        if (mobileTempAccountBtn) {
            mobileTempAccountBtn.addEventListener('click', () => {
                this.showTempAccountModal();
                this.closeMobileSidebar();
            });
        }
        
        // 移动端刷新按钮
        const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
        if (mobileRefreshBtn) {
            mobileRefreshBtn.addEventListener('click', () => {
                this.loadMobileEmails();
            });
        }
    }
    
    openMobileSidebar() {
        const mobileSidebar = document.getElementById('mobileSidebar');
        const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
        
        if (mobileSidebar) {
            mobileSidebar.classList.add('open');
        }
        
        if (mobileSidebarOverlay) {
            mobileSidebarOverlay.classList.add('show');
        }
        
        // 禁止背景滚动
        document.body.style.overflow = 'hidden';
    }
    
    closeMobileSidebar() {
        const mobileSidebar = document.getElementById('mobileSidebar');
        const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
        
        if (mobileSidebar) {
            mobileSidebar.classList.remove('open');
        }
        
        if (mobileSidebarOverlay) {
            mobileSidebarOverlay.classList.remove('show');
        }
        
        // 恢复背景滚动
        document.body.style.overflow = '';
    }
    
    async loadMobileEmails() {
        const mobileEmailInput = document.getElementById('mobileEmailInput');
        const email = mobileEmailInput.value.trim();
        
        if (!email) {
            this.showError('请输入邮箱地址');
            return;
        }
        
        // 同步桌面端输入框
        const desktopEmailInput = document.getElementById('emailInput');
        if (desktopEmailInput) {
            desktopEmailInput.value = email;
        }
        
        // 不关闭侧边栏，让用户可以继续操作
        // this.closeMobileSidebar();
        
        // 更新当前邮箱
        this.currentEmail = email;
        
        // 显示加载状态（主页和sidebar都显示）
        this.showLoading();
        
        try {
            // 使用相同的加载逻辑
            await this.loadEmailsInternal(email);
            
            // 更新移动端统计信息
            this.updateMobileStats();
            
            // 加载成功后可以选择关闭sidebar，或者让用户手动关闭
            // 这里我们不自动关闭，让用户有更好的控制
        } catch (error) {
            // 错误处理
            this.showError(error.message || '加载邮件失败');
        } finally {
            this.hideLoading();
        }
    }

    setupModals() {
        // 初始化模态框
        this.errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
        this.successModal = new bootstrap.Modal(document.getElementById('successModal'));
        this.importModal = new bootstrap.Modal(document.getElementById('importModal'));
        this.accountsModal = new bootstrap.Modal(document.getElementById('accountsModal'));
        this.accountFormModal = new bootstrap.Modal(document.getElementById('accountFormModal'));
        this.tempAccountModal = new bootstrap.Modal(document.getElementById('tempAccountModal'));
        
        // 绑定临时账户表单事件
        this.bindTempAccountEvents();
    }

    async loadEmails() {
        const emailInput = document.getElementById('emailInput');
        const email = emailInput.value.trim();
        
        if (!email) {
            this.showError('请输入邮箱地址');
            return;
        }

        // 更新当前邮箱
        this.currentEmail = email;
        
        // 显示加载状态
        this.showLoading();
        
        try {
            await this.loadEmailsInternal(email);
        } catch (error) {
            console.error('Error loading emails:', error);
            this.showError('网络错误，请检查连接');
            this.hideEmailInfo();
        } finally {
            this.hideLoading();
        }
    }

    async loadEmailsInternal(email) {
        let apiUrl = `/api/messages?email=${encodeURIComponent(email)}&top=5`;
        let requestOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        // 如果使用临时账户，添加临时账户信息到请求中
        if (this.usingTempAccount && this.tempAccount && this.tempAccount.email === email) {
            apiUrl = '/api/temp-messages';
            requestOptions.method = 'POST';
            requestOptions.body = JSON.stringify({
                email: this.tempAccount.email,
                password: this.tempAccount.password,
                client_id: this.tempAccount.client_id,
                refresh_token: this.tempAccount.refresh_token,
                top: 5
            });
        }
        
        const response = await fetch(apiUrl, requestOptions);
        const result = await response.json();
        
        if (result.success) {
            this.emails = result.data || [];
            this.displayEmails();
            this.updateStats();
            this.showEmailInfo();
        } else {
            this.showError(result.message || '获取邮件失败');
            this.hideEmailInfo();
            throw new Error(result.message || '获取邮件失败');
        }
    }

    displayEmails() {
        // 更新桌面端邮件列表
        this.displayDesktopEmails();
        
        // 更新移动端邮件列表
        this.displayMobileEmails();
    }
    
    displayDesktopEmails() {
        const emailList = document.getElementById('emailList');
        
        if (!this.emails || this.emails.length === 0) {
            emailList.innerHTML = `
                <div class="empty-state">
                    <div class="text-center py-5">
                        <i class="bi bi-inbox display-1 text-muted"></i>
                        <div class="mt-3 text-muted">
                            <h6>收件箱为空</h6>
                            <p class="small mb-0">该邮箱暂无邮件</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const emailsHtml = this.emails.map((email, index) => {
            const sender = email.sender?.emailAddress || email.from?.emailAddress || {};
            const senderName = sender.name || sender.address || '未知发件人';
            const subject = email.subject || '(无主题)';
            const date = this.formatDate(email.receivedDateTime);
            const preview = email.bodyPreview || '(无预览)';
            
            return `
                <div class="email-item" data-message-id="${email.id}" data-index="${index}">
                    <div class="email-sender">${this.escapeHtml(senderName)}</div>
                    <div class="email-subject">${this.escapeHtml(subject)}</div>
                    <div class="email-preview">${this.escapeHtml(preview)}</div>
                    <div class="email-time">${date}</div>
                </div>
            `;
        }).join('');

        emailList.innerHTML = emailsHtml;
        
        // 绑定邮件项点击事件
        this.bindEmailItemEvents();
    }
    
    displayMobileEmails() {
        const mobileEmailList = document.getElementById('mobileEmailList');
        
        if (!this.emails || this.emails.length === 0) {
            mobileEmailList.innerHTML = `
                <div class="empty-state text-center py-4">
                    <i class="bi bi-inbox text-white-50 fs-1"></i>
                    <div class="mt-3 text-white-50">
                        <div class="fw-bold">收件箱为空</div>
                        <p class="small mb-0 mt-1">该邮箱暂无邮件</p>
                    </div>
                </div>
            `;
            return;
        }

        const emailsHtml = this.emails.map((email, index) => {
            const sender = email.sender?.emailAddress || email.from?.emailAddress || {};
            const senderName = sender.name || sender.address || '未知发件人';
            const subject = email.subject || '(无主题)';
            const date = this.formatDate(email.receivedDateTime);
            const preview = email.bodyPreview || '(无预览)';
            
            return `
                <div class="email-item mobile-email-item" data-message-id="${email.id}" data-index="${index}">
                    <div class="email-sender">${this.escapeHtml(senderName)}</div>
                    <div class="email-subject">${this.escapeHtml(subject)}</div>
                    <div class="email-preview">${this.escapeHtml(preview)}</div>
                    <div class="email-time">${date}</div>
                </div>
            `;
        }).join('');

        mobileEmailList.innerHTML = emailsHtml;
        
        // 绑定移动端邮件项点击事件
        this.bindMobileEmailItemEvents();
    }

    bindEmailItemEvents() {
        const emailItems = document.querySelectorAll('.email-item:not(.mobile-email-item)');
        emailItems.forEach(item => {
            item.addEventListener('click', () => {
                // 移除之前的选中状态
                document.querySelectorAll('.email-item:not(.mobile-email-item)').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // 设置当前选中状态
                item.classList.add('selected');
                
                // 获取邮件详情
                const messageId = item.getAttribute('data-message-id');
                this.loadEmailDetail(messageId);
            });
        });
    }
    
    bindMobileEmailItemEvents() {
        const mobileEmailItems = document.querySelectorAll('.mobile-email-item');
        mobileEmailItems.forEach(item => {
            item.addEventListener('click', () => {
                // 移除之前的选中状态
                document.querySelectorAll('.mobile-email-item').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // 设置当前选中状态
                item.classList.add('selected');
                
                // 获取邮件详情
                const messageId = item.getAttribute('data-message-id');
                this.loadEmailDetail(messageId);
                
                // 关闭移动端侧边栏
                this.closeMobileSidebar();
            });
        });
    }

    async loadEmailDetail(messageId) {
        if (!messageId || !this.currentEmail) {
            return;
        }

        this.selectedMessageId = messageId;
        
        // 显示加载状态
        const emailDetail = document.getElementById('emailDetail');
        emailDetail.innerHTML = `
            <div class="loading-state">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">加载中...</span>
                    </div>
                    <div class="mt-2 text-muted">正在加载邮件详情...</div>
                </div>
            </div>
        `;

        try {
            let apiUrl = `/api/message/${messageId}?email=${encodeURIComponent(this.currentEmail)}`;
            let requestOptions = {
                method: 'GET'
            };
            
            // 如果使用临时账户，使用不同的API
            if (this.usingTempAccount && this.tempAccount && this.tempAccount.email === this.currentEmail) {
                apiUrl = '/api/temp-message-detail';
                requestOptions.method = 'POST';
                requestOptions.headers = {
                    'Content-Type': 'application/json'
                };
                requestOptions.body = JSON.stringify({
                    email: this.tempAccount.email,
                    password: this.tempAccount.password,
                    client_id: this.tempAccount.client_id,
                    refresh_token: this.tempAccount.refresh_token,
                    message_id: messageId
                });
            }
            
            const response = await fetch(apiUrl, requestOptions);
            const result = await response.json();
            
            if (result.success) {
                this.displayEmailDetail(result.data);
            } else {
                this.showError(result.message || '获取邮件详情失败');
                this.clearEmailDetail();
            }
        } catch (error) {
            console.error('Error loading email detail:', error);
            this.showError('网络错误，请检查连接');
            this.clearEmailDetail();
        }
    }

    displayEmailDetail(email) {
        const emailDetail = document.getElementById('emailDetail');
        
        const sender = email.sender?.emailAddress || {};
        const senderName = sender.name || sender.address || '未知发件人';
        const toRecipients = email.toRecipients || [];
        const recipients = toRecipients.map(r => r.emailAddress?.name || r.emailAddress?.address).join(', ') || '未知收件人';
        
        const subject = email.subject || '(无主题)';
        const date = this.formatDate(email.receivedDateTime);
        const body = email.body?.content || '(无内容)';
        const contentType = email.body?.contentType || 'text';
        
        // 检查是否为HTML内容
        const isHtmlContent = contentType === 'html' || 
                              body.includes('<html') || 
                              body.includes('<body') || 
                              body.includes('<div') || 
                              body.includes('<p>');
        
        let bodyHtml = '';
        if (isHtmlContent) {
            // HTML内容使用iframe隔离样式
            const cleanedHtml = this.sanitizeHtml(body);
            const iframeId = 'email-content-iframe-' + Date.now();
            bodyHtml = `
                <div class="email-detail-body iframe-container">
                    <iframe id="${iframeId}" class="email-iframe" sandbox="allow-same-origin" frameborder="0"></iframe>
                </div>
            `;
            
            // 延迟设置iframe内容，确保iframe已经创建
            setTimeout(() => {
                this.setIframeContent(iframeId, cleanedHtml);
            }, 10);
        } else {
            // 文本内容进行HTML转义
            bodyHtml = `<div class="email-detail-body text-content">${this.escapeHtml(body)}</div>`;
        }
        
        emailDetail.innerHTML = `
            <div class="email-detail-header">
                <div class="email-detail-subject">${this.escapeHtml(subject)}</div>
                <div class="email-detail-meta">
                    <div class="meta-row">
                        <span class="meta-label">发件人:</span>
                        <span class="meta-value">${this.escapeHtml(senderName)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">收件人:</span>
                        <span class="meta-value">${this.escapeHtml(recipients)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">时间:</span>
                        <span class="meta-value">${date}</span>
                    </div>
                </div>
            </div>
            ${bodyHtml}
        `;
    }

    clearEmailDetail() {
        const emailDetail = document.getElementById('emailDetail');
        emailDetail.innerHTML = `
            <div class="empty-detail">
                <div class="text-center py-5">
                    <i class="bi bi-envelope display-1 text-muted"></i>
                    <div class="mt-3 text-muted">
                        <h6>选择邮件查看详情</h6>
                        <p class="small mb-0">点击左侧邮件列表中的邮件查看详细内容</p>
                    </div>
                </div>
            </div>
        `;
    }

    updateStats() {
        const totalEmails = document.getElementById('totalEmails');
        const emailStats = document.getElementById('emailStats');
        
        totalEmails.textContent = this.emails.length;
        emailStats.style.display = 'block';
        
        // 同时更新移动端统计
        this.updateMobileStats();
    }
    
    updateMobileStats() {
        const mobileTotalEmails = document.getElementById('mobileTotalEmails');
        const mobileEmailStats = document.getElementById('mobileEmailStats');
        const mobileCurrentEmailText = document.getElementById('mobileCurrentEmailText');
        const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
        
        if (mobileTotalEmails) {
            mobileTotalEmails.textContent = this.emails.length;
        }
        
        if (mobileCurrentEmailText) {
            mobileCurrentEmailText.textContent = this.currentEmail;
        }
        
        if (mobileEmailStats) {
            mobileEmailStats.style.display = 'block';
        }
        
        if (mobileRefreshBtn) {
            mobileRefreshBtn.style.display = 'inline-block';
        }
    }

    showEmailInfo() {
        const emailStats = document.getElementById('emailStats');
        const currentEmailText = document.getElementById('currentEmailText');
        const refreshBtn = document.getElementById('refreshBtn');
        
        if (currentEmailText) {
            currentEmailText.textContent = this.currentEmail;
        }
        if (emailStats) {
            emailStats.style.display = 'block';
        }
        if (refreshBtn) {
            refreshBtn.style.display = 'inline-block';
        }
    }

    hideEmailInfo() {
        const emailStats = document.getElementById('emailStats');
        const refreshBtn = document.getElementById('refreshBtn');
        const mobileEmailStats = document.getElementById('mobileEmailStats');
        const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
        
        if (emailStats) {
            emailStats.style.display = 'none';
        }
        if (refreshBtn) {
            refreshBtn.style.display = 'none';
        }
        
        // 同时隐藏移动端统计信息
        if (mobileEmailStats) {
            mobileEmailStats.style.display = 'none';
        }
        if (mobileRefreshBtn) {
            mobileRefreshBtn.style.display = 'none';
        }
        
        // 清空邮件列表和详情
        this.clearEmailList();
        this.clearEmailDetail();
    }

    clearEmailList() {
        const emailList = document.getElementById('emailList');
        const mobileEmailList = document.getElementById('mobileEmailList');
        
        // 清空桌面端邮件列表
        if (emailList) {
            emailList.innerHTML = `
                <div class="empty-state">
                    <div class="text-center py-5">
                        <i class="bi bi-inbox display-1 text-muted"></i>
                        <div class="mt-3 text-muted">
                            <h6>欢迎使用邮件管理系统</h6>
                            <p class="small mb-0">请在顶部输入邮箱地址开始查看邮件</p>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 清空移动端邮件列表
        if (mobileEmailList) {
            mobileEmailList.innerHTML = `
                <div class="empty-state text-center py-4">
                    <i class="bi bi-inbox text-white-50 fs-1"></i>
                    <div class="mt-3 text-white-50">
                        <div class="fw-bold">输入邮箱查看邮件</div>
                        <p class="small mb-0 mt-1">请在上方输入邮箱地址</p>
                    </div>
                </div>
            `;
        }
    }

    showLoading() {
        const loadingEmails = document.getElementById('loadingEmails');
        const emailList = document.getElementById('emailList');
        const mobileLoadingEmails = document.getElementById('mobileLoadingEmails');
        const mobileEmailList = document.getElementById('mobileEmailList');
        
        // 桌面端加载状态
        if (loadingEmails) {
            loadingEmails.style.display = 'block';
        }
        if (emailList) {
            emailList.style.display = 'none';
        }
        
        // 移动端加载状态
        if (mobileLoadingEmails) {
            mobileLoadingEmails.style.display = 'block';
        }
        if (mobileEmailList) {
            mobileEmailList.style.display = 'none';
        }
    }

    hideLoading() {
        const loadingEmails = document.getElementById('loadingEmails');
        const emailList = document.getElementById('emailList');
        const mobileLoadingEmails = document.getElementById('mobileLoadingEmails');
        const mobileEmailList = document.getElementById('mobileEmailList');
        
        // 桌面端加载状态
        if (loadingEmails) {
            loadingEmails.style.display = 'none';
        }
        if (emailList) {
            emailList.style.display = 'block';
        }
        
        // 移动端加载状态
        if (mobileLoadingEmails) {
            mobileLoadingEmails.style.display = 'none';
        }
        if (mobileEmailList) {
            mobileEmailList.style.display = 'block';
        }
    }

    showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        this.errorModal.show();
    }

    showSuccess(message) {
        const successMessage = document.getElementById('successMessage');
        successMessage.textContent = message;
        this.successModal.show();
    }

    formatDate(dateString) {
        if (!dateString) return '未知时间';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return dateString; // 如果无法解析，返回原字符串
            }
            
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            
            const timeDiff = today.getTime() - messageDate.getTime();
            const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
            
            if (daysDiff === 0) {
                return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            } else if (daysDiff === 1) {
                return '昨天';
            } else if (daysDiff < 7) {
                return `${daysDiff}天前`;
            } else {
                return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
            }
        } catch (error) {
            console.error('Date formatting error:', error);
            return dateString;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    sanitizeHtml(html) {
        // 简单的HTML清理，移除可能的恶意脚本
        // 在生产环境中，建议使用专业的HTML清理库如DOMPurify
        if (!html) return '';
        
        // 移除script标签和事件处理器
        let cleaned = html
            .replace(/<script[^>]*>.*?<\/script>/gis, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/on\w+='[^']*'/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/data:/gi, '')
            // 移除多余的空白和换行（保持适中清理）
            .replace(/\r\n\r\n\s*/g, '\n')
            .replace(/\n\s*\n/g, '\n')
            // 移除空的段落和容器（但保留原始布局）
            .replace(/<p>\s*<\/p>/gi, '')
            .replace(/<div>\s*<\/div>/gi, '')
            .replace(/<span>\s*<\/span>/gi, '')
            .trim();
        
        return cleaned;
    }
    
    setIframeContent(iframeId, htmlContent) {
        const iframe = document.getElementById(iframeId);
        if (!iframe) return;
        
        // 创建完整的HTML文档，保持原始样式
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        margin: 0;
                        padding: 12px;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #323130;
                        background: white;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    
                    /* 保持表格样式 */
                    table {
                        border-collapse: collapse;
                        width: 100%;
                        max-width: 100%;
                    }
                    
                    td, th {
                        vertical-align: top;
                        word-wrap: break-word;
                    }
                    
                    /* 保持图片样式 */
                    img {
                        max-width: 100%;
                        height: auto;
                        display: block;
                    }
                    
                    /* 保持链接样式 */
                    a {
                        color: #0078d4;
                        text-decoration: none;
                    }
                    
                    a:hover {
                        text-decoration: underline;
                    }
                    
                    /* 保持按钮样式 */
                    .btn, button {
                        display: inline-block;
                        padding: 8px 16px;
                        background: #0078d4;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        text-decoration: none;
                        cursor: pointer;
                    }
                    
                    /* 响应式处理 */
                    @media (max-width: 600px) {
                        body {
                            padding: 8px;
                            font-size: 13px;
                        }
                        
                        table {
                            font-size: 12px;
                        }
                    }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `;
        
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(fullHtml);
            iframeDoc.close();
            
            // 动态调整iframe高度
            setTimeout(() => {
                this.adjustIframeHeight(iframe);
            }, 100);
            
            // 监听iframe内容变化
            iframe.onload = () => {
                this.adjustIframeHeight(iframe);
            };
            
        } catch (error) {
            console.error('设置iframe内容失败:', error);
            // 降级处理：如果iframe失败，使用普通div显示
            iframe.outerHTML = `<div class="email-detail-body html-content fallback">${htmlContent}</div>`;
        }
    }
    
    adjustIframeHeight(iframe) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc && iframeDoc.body) {
                const height = Math.max(
                    iframeDoc.body.scrollHeight,
                    iframeDoc.body.offsetHeight,
                    iframeDoc.documentElement.clientHeight,
                    iframeDoc.documentElement.scrollHeight,
                    iframeDoc.documentElement.offsetHeight
                );
                
                // 设置最小高度和最大高度
                const minHeight = 200;
                const maxHeight = 800;
                const finalHeight = Math.min(Math.max(height + 20, minHeight), maxHeight);
                
                iframe.style.height = finalHeight + 'px';
            }
        } catch (error) {
            console.error('调整iframe高度失败:', error);
            // 设置默认高度
            iframe.style.height = '400px';
        }
    }

    // ========== 导入功能相关方法 ==========

    bindImportEvents() {
        // 导入方式切换
        const importTypeRadios = document.querySelectorAll('input[name="importType"]');
        importTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.toggleImportArea();
            });
        });

        // 预览按钮
        const previewBtn = document.getElementById('previewBtn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                this.previewImportData();
            });
        }

        // 确认导入按钮
        const confirmImportBtn = document.getElementById('confirmImportBtn');
        if (confirmImportBtn) {
            confirmImportBtn.addEventListener('click', () => {
                this.confirmImport();
            });
        }

        // 刷新账户列表按钮
        const refreshAccountsBtn = document.getElementById('refreshAccountsBtn');
        if (refreshAccountsBtn) {
            refreshAccountsBtn.addEventListener('click', () => {
                this.loadAccountsList();
            });
        }

        // 新增账户按钮
        const addAccountBtn = document.getElementById('addAccountBtn');
        if (addAccountBtn) {
            addAccountBtn.addEventListener('click', () => {
                this.showAccountForm();
            });
        }

        // 导出按钮
        const exportTxtBtn = document.getElementById('exportTxtBtn');
        if (exportTxtBtn) {
            exportTxtBtn.addEventListener('click', () => {
                this.exportAccounts('txt');
            });
        }

        const exportJsonBtn = document.getElementById('exportJsonBtn');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => {
                this.exportAccounts('json');
            });
        }

        // 账户表单提交
        const accountForm = document.getElementById('accountForm');
        if (accountForm) {
            accountForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAccount();
            });
        }

        // 文件上传事件
        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e);
            });
        }
    }

    showImportModal() {
        // 重置导入表单
        const importTextarea = document.getElementById('importTextarea');
        const importFileInput = document.getElementById('importFileInput');
        const mergeMode = document.getElementById('mergeMode');
        const previewArea = document.getElementById('previewArea');
        const confirmImportBtn = document.getElementById('confirmImportBtn');
        
        if (importTextarea) importTextarea.value = '';
        if (importFileInput) importFileInput.value = '';
        if (mergeMode) mergeMode.value = 'update';
        if (previewArea) previewArea.style.display = 'none';
        if (confirmImportBtn) confirmImportBtn.disabled = true;
        
        // 默认选中文本导入
        const importTextRadio = document.getElementById('importText');
        if (importTextRadio) {
            importTextRadio.checked = true;
            this.toggleImportArea();
        }
        
        this.importModal.show();
    }

    showAccountsModal() {
        this.accountsModal.show();
        this.loadAccountsList();
    }

    toggleImportArea() {
        const importType = document.querySelector('input[name="importType"]:checked')?.value;
        const textImportArea = document.getElementById('textImportArea');
        const fileImportArea = document.getElementById('fileImportArea');
        
        if (importType === 'file') {
            textImportArea.style.display = 'none';
            fileImportArea.style.display = 'block';
        } else {
            textImportArea.style.display = 'block';
            fileImportArea.style.display = 'none';
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await this.readFileAsText(file);
            const importTextarea = document.getElementById('importTextarea');
            if (importTextarea) {
                importTextarea.value = text;
            }
            
            // 切换到文本模式并隐藏文件选择
            const importTextRadio = document.getElementById('importText');
            if (importTextRadio) {
                importTextRadio.checked = true;
                this.toggleImportArea();
            }
            
        } catch (error) {
            this.showError('文件读取失败：' + error.message);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('文件读取错误'));
            reader.readAsText(file, 'utf-8');
        });
    }

    async previewImportData() {
        const importTextarea = document.getElementById('importTextarea');
        const text = importTextarea?.value?.trim();
        
        if (!text) {
            this.showError('请输入要导入的数据');
            return;
        }
        
        try {
            const response = await fetch('/api/parse-import-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.displayPreview(result.data);
                const confirmImportBtn = document.getElementById('confirmImportBtn');
                if (confirmImportBtn) {
                    confirmImportBtn.disabled = false;
                }
            } else {
                this.showError(result.message || '解析数据失败');
            }
        } catch (error) {
            console.error('Preview error:', error);
            this.showError('预览失败：网络错误');
        }
    }

    displayPreview(data) {
        const previewArea = document.getElementById('previewArea');
        const previewContent = document.getElementById('previewContent');
        
        if (!previewArea || !previewContent) return;
        
        const { accounts, parsed_count, error_count, errors } = data;
        
        let html = `
            <div class="mb-3">
                <h6>解析结果</h6>
                <p class="mb-2">成功解析 <span class="text-success fw-bold">${parsed_count}</span> 条账户</p>
                ${error_count > 0 ? `<p class="mb-2 text-danger">错误 ${error_count} 条</p>` : ''}
            </div>
        `;
        
        if (accounts.length > 0) {
            html += `<div class="mb-3"><h6>账户列表</h6><div class="list-group list-group-flush">`;
            accounts.forEach((account, index) => {
                html += `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${this.escapeHtml(account.email)}</strong>
                            ${account.password ? '<small class="text-muted d-block">包含密码</small>' : ''}
                        </div>
                        <span class="badge bg-primary rounded-pill">${index + 1}</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }
        
        if (errors.length > 0) {
            html += `<div class="mb-3"><h6 class="text-danger">错误信息</h6><div class="alert alert-danger">`;
            errors.forEach(error => {
                html += `<div class="small">${this.escapeHtml(error)}</div>`;
            });
            html += `</div></div>`;
        }
        
        previewContent.innerHTML = html;
        previewArea.style.display = 'block';
    }

    async confirmImport() {
        const importTextarea = document.getElementById('importTextarea');
        const mergeMode = document.getElementById('mergeMode');
        
        const text = importTextarea?.value?.trim();
        const mode = mergeMode?.value || 'update';
        
        if (!text) {
            this.showError('请输入要导入的数据');
            return;
        }
        
        try {
            // 首先解析数据
            const parseResponse = await fetch('/api/parse-import-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });
            
            const parseResult = await parseResponse.json();
            
            if (!parseResult.success) {
                this.showError(parseResult.message || '解析数据失败');
                return;
            }
            
            const accounts = parseResult.data.accounts.map(account => ({
                email: account.email,
                password: account.password || '',
                client_id: account.client_id || '',
                refresh_token: account.refresh_token
            }));
            
            // 执行导入
            const importData = {
                accounts: accounts,
                merge_mode: mode
            };
            
            const importResponse = await fetch('/api/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(importData)
            });
            
            const importResult = await importResponse.json();
            
            if (importResult.success) {
                this.importModal.hide();
                this.showSuccess(importResult.message);
                
                // 如果账户管理模态框是打开的，刷新列表
                if (this.accountsModal._isShown) {
                    this.loadAccountsList();
                }
            } else {
                this.showError(importResult.message || '导入失败');
            }
            
        } catch (error) {
            console.error('Import error:', error);
            this.showError('导入失败：网络错误');
        }
    }

    async loadAccountsList() {
        const accountsList = document.getElementById('accountsList');
        
        if (!accountsList) return;
        
        // 显示加载状态
        accountsList.innerHTML = `
            <div class="text-center text-muted">
                <div class="spinner-border spinner-border-sm" role="status"></div>
                <div class="mt-2">加载中...</div>
            </div>
        `;
        
        try {
            const response = await fetch('/api/accounts');
            const result = await response.json();
            
            if (result.success) {
                this.displayAccountsList(result.data);
            } else {
                accountsList.innerHTML = `
                    <div class="text-center text-danger">
                        <i class="bi bi-exclamation-triangle"></i>
                        <div class="mt-2">${result.message || '加载失败'}</div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Load accounts error:', error);
            accountsList.innerHTML = `
                <div class="text-center text-danger">
                    <i class="bi bi-wifi-off"></i>
                    <div class="mt-2">网络错误</div>
                </div>
            `;
        }
    }

    displayAccountsList(accounts) {
        const accountsList = document.getElementById('accountsList');
        
        if (!accountsList) return;
        
        if (accounts.length === 0) {
            accountsList.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i class="bi bi-inbox display-1"></i>
                    <div class="mt-2">暂无账户数据</div>
                    <div class="mt-2">
                        <button class="btn btn-primary btn-sm" onclick="emailManager.showAccountForm()">
                            <i class="bi bi-plus-circle me-1"></i>添加第一个账户
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        let html = `
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>序号</th>
                            <th>邮箱地址</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        accounts.forEach((account, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <strong>${this.escapeHtml(account.email)}</strong>
                    </td>
                    <td>
                        <span class="badge bg-success">已配置</span>
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="emailManager.useAccount('${account.email}')" title="使用该账户">
                                <i class="bi bi-arrow-right"></i>
                            </button>
                            <button class="btn btn-outline-secondary" onclick="emailManager.showAccountForm('${account.email}')" title="编辑">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="emailManager.deleteAccount('${account.email}')" title="删除">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        accountsList.innerHTML = html;
    }

    useAccount(email) {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) {
            emailInput.value = email;
            this.accountsModal.hide();
            
            // 可以选择是否自动加载邮件
            // this.loadEmails();
        }
    }

    // ========== 账户管理功能 ==========

    showAccountForm(email = null) {
        const accountFormTitle = document.getElementById('accountFormTitle');
        const originalEmail = document.getElementById('originalEmail');
        const accountEmail = document.getElementById('accountEmail');
        const accountPassword = document.getElementById('accountPassword');
        const accountRefreshToken = document.getElementById('accountRefreshToken');
        
        if (email) {
            // 编辑模式
            accountFormTitle.textContent = '编辑账户';
            originalEmail.value = email;
            this.loadAccountForEdit(email);
        } else {
            // 新增模式
            accountFormTitle.textContent = '新增账户';
            originalEmail.value = '';
            accountEmail.value = '';
            accountPassword.value = '';
            accountRefreshToken.value = '';
        }
        
        this.accountFormModal.show();
    }

    async loadAccountForEdit(email) {
        // 从当前加载的账户列表中获取账户信息
        // 这里简化处理，实际上可以通过API获取详细信息
        const accountEmail = document.getElementById('accountEmail');
        const accountPassword = document.getElementById('accountPassword');
        const accountRefreshToken = document.getElementById('accountRefreshToken');
        
        accountEmail.value = email;
        accountPassword.value = ''; // 密码不显示，出于安全考虑
        accountRefreshToken.value = ''; // 同样不显示敏感信息
        
        // 提示用户
        const refreshTokenField = document.getElementById('accountRefreshToken');
        refreshTokenField.placeholder = '留空保持现有值不变，或输入新的Refresh Token';
    }

    async saveAccount() {
        const originalEmail = document.getElementById('originalEmail').value;
        const accountEmail = document.getElementById('accountEmail').value.trim();
        const accountPassword = document.getElementById('accountPassword').value;
        const accountRefreshToken = document.getElementById('accountRefreshToken').value.trim();
        
        if (!accountEmail) {
            this.showError('请输入邮箱地址');
            return;
        }
        
        if (!accountRefreshToken && !originalEmail) {
            this.showError('请输入Refresh Token');
            return;
        }
        
        try {
            const accountData = {
                email: accountEmail,
                password: accountPassword,
                refresh_token: accountRefreshToken
            };
            
            let response;
            if (originalEmail) {
                // 更新现有账户
                response = await fetch(`/api/account/${encodeURIComponent(originalEmail)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(accountData)
                });
            } else {
                // 新增账户
                response = await fetch('/api/account', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(accountData)
                });
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.accountFormModal.hide();
                this.showSuccess(result.message);
                this.loadAccountsList(); // 刷新账户列表
            } else {
                this.showError(result.message || '保存账户失败');
            }
            
        } catch (error) {
            console.error('Save account error:', error);
            this.showError('保存账户失败：网络错误');
        }
    }

    async deleteAccount(email) {
        if (!confirm(`确定要删除账户 ${email} 吗？`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/account/${encodeURIComponent(email)}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess(result.message);
                this.loadAccountsList(); // 刷新账户列表
            } else {
                this.showError(result.message || '删除账户失败');
            }
            
        } catch (error) {
            console.error('Delete account error:', error);
            this.showError('删除账户失败：网络错误');
        }
    }

    async exportAccounts(format) {
        try {
            const response = await fetch(`/api/export?format=${format}`);
            
            if (response.ok) {
                // 所有格式都直接获取文本内容（后端已统一返回PlainTextResponse）
                const content = await response.text();
                
                // 从响应头获取文件名
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'accounts_export.txt';
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename=(.+)/);
                    if (match) {
                        filename = match[1];
                    }
                }
                
                this.downloadFile(content, filename, 'text/plain');
                this.showSuccess('导出成功');
            } else {
                this.showError(`导出失败: HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('导出失败：网络错误');
        }
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // ==================== 临时账户相关方法 ====================
    
    loadTempAccount() {
        // 从 sessionStorage 加载临时账户
        const tempAccountData = sessionStorage.getItem('tempAccount');
        if (tempAccountData) {
            try {
                this.tempAccount = JSON.parse(tempAccountData);
                this.usingTempAccount = true;
                this.updateTempAccountStatus();
            } catch (error) {
                console.error('加载临时账户失败:', error);
                sessionStorage.removeItem('tempAccount');
            }
        }
    }
    
    showTempAccountModal() {
        // 如果有现有的临时账户，预填表单
        if (this.tempAccount) {
            document.getElementById('tempEmail').value = this.tempAccount.email || '';
            document.getElementById('tempPassword').value = this.tempAccount.password || '';
            document.getElementById('tempClientId').value = this.tempAccount.client_id || '';
            document.getElementById('tempRefreshToken').value = this.tempAccount.refresh_token || '';
        }
        
        this.tempAccountModal.show();
    }
    
    bindTempAccountEvents() {
        // 临时账户表单提交
        document.getElementById('tempAccountForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTempAccount();
        });
        
        // 清除临时账户
        document.getElementById('clearTempAccountBtn').addEventListener('click', () => {
            this.clearTempAccount();
        });
    }
    
    saveTempAccount() {
        const email = document.getElementById('tempEmail').value.trim();
        const password = document.getElementById('tempPassword').value.trim();
        const clientId = document.getElementById('tempClientId').value.trim();
        const refreshToken = document.getElementById('tempRefreshToken').value.trim();
        
        if (!email) {
            this.showError('请输入邮箱地址');
            return;
        }
        
        if (!refreshToken) {
            this.showError('请输入 Refresh Token');
            return;
        }
        
        // 保存临时账户
        this.tempAccount = {
            email: email,
            password: password,
            client_id: clientId || 'dbc8e03a-b00c-46bd-ae65-b683e7707cb0', // 使用默认CLIENT_ID
            refresh_token: refreshToken
        };
        
        // 保存到 sessionStorage
        sessionStorage.setItem('tempAccount', JSON.stringify(this.tempAccount));
        
        this.usingTempAccount = true;
        this.updateTempAccountStatus();
        
        // 关闭模态框
        this.tempAccountModal.hide();
        
        // 显示成功提示
        this.showSuccess(`临时账户设置成功: ${email}`);
        
        // 自动填入邮箱地址（桌面端和移动端）
        const emailInput = document.getElementById('emailInput');
        const mobileEmailInput = document.getElementById('mobileEmailInput');
        
        if (emailInput) {
            emailInput.value = email;
        }
        if (mobileEmailInput) {
            mobileEmailInput.value = email;
        }
    }
    
    clearTempAccount() {
        if (confirm('确定要清除临时账户吗？')) {
            this.tempAccount = null;
            this.usingTempAccount = false;
            sessionStorage.removeItem('tempAccount');
            
            // 清空表单
            document.getElementById('tempAccountForm').reset();
            
            this.updateTempAccountStatus();
            this.tempAccountModal.hide();
            
            this.showSuccess('临时账户已清除');
        }
    }
    
    updateTempAccountStatus() {
        const tempAccountBtn = document.getElementById('tempAccountBtn');
        const mobileTempAccountBtn = document.getElementById('mobileTempAccountBtn');
        const emailInput = document.getElementById('emailInput');
        const mobileEmailInput = document.getElementById('mobileEmailInput');
        
        if (this.usingTempAccount && this.tempAccount) {
            // 更新桌面端按钮样式表示正在使用临时账户
            if (tempAccountBtn) {
                tempAccountBtn.classList.remove('btn-outline-light');
                tempAccountBtn.classList.add('btn-warning');
                tempAccountBtn.innerHTML = `
                    <i class="bi bi-person-check"></i>
                    <span class="ms-1 d-none d-xl-inline">临时账户</span>
                `;
                tempAccountBtn.title = `正在使用临时账户: ${this.tempAccount.email}`;
            }
            
            // 更新移动端按钮样式
            if (mobileTempAccountBtn) {
                mobileTempAccountBtn.classList.remove('btn-outline-light');
                mobileTempAccountBtn.classList.add('btn-warning');
                mobileTempAccountBtn.innerHTML = `
                    <i class="bi bi-person-check me-2"></i>
                    正在使用临时账户
                `;
            }
            
            // 在邮箱输入框添加提示
            if (emailInput) {
                emailInput.placeholder = `当前使用临时账户: ${this.tempAccount.email}`;
            }
            if (mobileEmailInput) {
                mobileEmailInput.placeholder = `当前使用临时账户: ${this.tempAccount.email}`;
            }
        } else {
            // 恢复桌面端按钮原始样式
            if (tempAccountBtn) {
                tempAccountBtn.classList.remove('btn-warning');
                tempAccountBtn.classList.add('btn-outline-light');
                tempAccountBtn.innerHTML = `
                    <i class="bi bi-person-plus"></i>
                    <span class="ms-1 d-none d-xl-inline">临时账户</span>
                `;
                tempAccountBtn.title = '使用临时账户';
            }
            
            // 恢复移动端按钮原始样式
            if (mobileTempAccountBtn) {
                mobileTempAccountBtn.classList.remove('btn-warning');
                mobileTempAccountBtn.classList.add('btn-outline-light');
                mobileTempAccountBtn.innerHTML = `
                    <i class="bi bi-person-plus me-2"></i>
                    使用临时账户
                `;
            }
            
            // 恢复原始占位符
            if (emailInput) {
                emailInput.placeholder = '输入邮箱地址';
            }
            if (mobileEmailInput) {
                mobileEmailInput.placeholder = '输入邮箱地址';
            }
        }
    }
}

// 初始化应用
let emailManager;
document.addEventListener('DOMContentLoaded', () => {
    emailManager = new EmailManager();
});