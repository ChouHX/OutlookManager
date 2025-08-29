// 账号管理页面JavaScript

class AdminManager {
    constructor() {
        this.isAuthenticated = false;
        this.token = '';
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkStoredAuth();
    }

    bindEvents() {
        // 登录表单
        document.getElementById('loginForm').addEventListener('submit', this.handleLogin.bind(this));
        
        // 刷新账号列表
        document.getElementById('refreshAccountsBtn').addEventListener('click', this.loadAccounts.bind(this));
        
        // 导入相关
        document.getElementById('executeImportBtn').addEventListener('click', this.executeImport.bind(this));
        document.getElementById('clearImportBtn').addEventListener('click', this.clearImport.bind(this));
        
        // 导出
        document.getElementById('exportDataBtn').addEventListener('click', this.exportData.bind(this));
        
        // 退出登录
        document.getElementById('logoutBtn').addEventListener('click', this.logout.bind(this));
        
        // 选项卡切换时刷新数据
        document.getElementById('accounts-tab').addEventListener('click', () => {
            setTimeout(() => this.loadAccounts(), 100);
        });
    }

    checkStoredAuth() {
        // 检查是否有保存的认证信息（仅在当前会话有效）
        const storedToken = sessionStorage.getItem('admin_token');
        if (storedToken) {
            this.token = storedToken;
            this.showManagement();
        }
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const tokenInput = document.getElementById('tokenInput');
        const enteredToken = tokenInput.value.trim();
        
        if (!enteredToken) {
            this.showError('请输入管理令牌');
            return;
        }

        try {
            // 验证令牌
            const isValid = await this.verifyToken(enteredToken);
            
            if (isValid) {
                this.token = enteredToken;
                this.isAuthenticated = true;
                
                // 保存到会话存储
                sessionStorage.setItem('admin_token', enteredToken);
                
                this.showManagement();
                this.showSuccess('登录成功');
            } else {
                this.showError('令牌验证失败，请检查输入的令牌是否正确');
            }
        } catch (error) {
            console.error('登录失败:', error);
            this.showError('登录失败: ' + error.message);
        }
    }

    async verifyToken(token) {
        try {
            // 发送验证请求到后端
            const response = await fetch('/api/admin/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: token })
            });

            if (response.ok) {
                const result = await response.json();
                return result.success;
            }
            return false;
        } catch (error) {
            console.error('令牌验证错误:', error);
            return false;
        }
    }

    showManagement() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('managementSection').style.display = 'block';
        
        // 自动加载账号列表
        this.loadAccounts();
    }

    async loadAccounts() {
        const accountsList = document.getElementById('accountsList');
        const accountCount = document.getElementById('accountCount');
        
        // 显示加载状态
        accountsList.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <div class="mt-2">正在加载账号列表...</div>
            </div>
        `;

        try {
            const response = await fetch('/api/accounts', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.renderAccounts(result.data);
                    accountCount.textContent = result.data.length;
                } else {
                    throw new Error(result.message);
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('加载账号列表失败:', error);
            accountsList.innerHTML = `
                <div class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle display-4"></i>
                    <div class="mt-2">加载失败: ${error.message}</div>
                    <button class="btn btn-outline-primary btn-sm mt-2" onclick="adminManager.loadAccounts()">
                        <i class="bi bi-arrow-clockwise me-1"></i>重试
                    </button>
                </div>
            `;
            accountCount.textContent = '0';
        }
    }

    renderAccounts(accounts) {
        const accountsList = document.getElementById('accountsList');
        
        if (accounts.length === 0) {
            accountsList.innerHTML = `
                <div class="text-center py-4">
                    <i class="bi bi-inbox display-4 text-muted"></i>
                    <div class="mt-3 text-muted">
                        <h6>暂无账号数据</h6>
                        <p class="small mb-0">请通过"数据导入"功能添加邮箱账号</p>
                    </div>
                </div>
            `;
            return;
        }

        const accountsHtml = accounts.map((account, index) => `
            <div class="account-item">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">
                            <i class="bi bi-envelope me-2"></i>${account.email}
                        </h6>
                        <div class="small text-muted">
                            <span class="me-3">
                                <i class="bi bi-calendar3 me-1"></i>
                                添加时间: ${new Date().toLocaleDateString()}
                            </span>
                            <span class="badge bg-success">
                                <i class="bi bi-check-circle me-1"></i>已配置
                            </span>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-outline-primary btn-sm me-2" 
                                onclick="adminManager.testAccount('${account.email}')">
                            <i class="bi bi-play-circle me-1"></i>测试
                        </button>
                        <button class="btn btn-outline-danger btn-sm" 
                                onclick="adminManager.deleteAccount('${account.email}')">
                            <i class="bi bi-trash me-1"></i>删除
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        accountsList.innerHTML = accountsHtml;
    }

    async testAccount(email) {
        // 获取按钮元素
        const testButton = document.querySelector(`button[onclick="adminManager.testAccount('${email}')"]`);
        const originalButtonContent = testButton.innerHTML;
        
        try {
            // 显示加载动画
            testButton.disabled = true;
            testButton.innerHTML = `
                <span class="spinner-border spinner-border-sm me-1" role="status">
                    <span class="visually-hidden">正在测试...</span>
                </span>
                测试中...
            `;
            
            const response = await fetch(`/api/messages?email=${encodeURIComponent(email)}&top=1`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.showSuccess(`账号 ${email} 测试成功，可以正常获取邮件`);
                } else {
                    this.showError(`账号 ${email} 测试失败: ${result.message}`);
                }
            } else {
                this.showError(`账号 ${email} 测试失败: HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('测试账号失败:', error);
            this.showError(`账号 ${email} 测试失败: ${error.message}`);
        } finally {
            // 恢复按钮状态
            testButton.disabled = false;
            testButton.innerHTML = originalButtonContent;
        }
    }

    async deleteAccount(email) {
        if (!confirm(`确定要删除账号 ${email} 吗？此操作不可撤销。`)) {
            return;
        }

        try {
            const response = await fetch('/api/admin/accounts', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ email: email })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.showSuccess(`账号 ${email} 删除成功`);
                    this.loadAccounts(); // 刷新列表
                } else {
                    this.showError(`删除失败: ${result.message}`);
                }
            } else {
                this.showError(`删除失败: HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('删除账号失败:', error);
            this.showError(`删除失败: ${error.message}`);
        }
    }

    clearImport() {
        document.getElementById('importTextarea').value = '';
        document.getElementById('mergeMode').value = 'update';
        this.showSuccess('已清空导入内容');
    }

    async executeImport() {
        const textarea = document.getElementById('importTextarea');
        const mergeMode = document.getElementById('mergeMode');
        
        const importText = textarea.value.trim();
        if (!importText) {
            this.showError('请输入要导入的账户数据');
            return;
        }

        try {
            // 解析文本
            const parseResponse = await fetch('/api/parse-import-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ text: importText })
            });

            if (!parseResponse.ok) {
                throw new Error(`解析失败: HTTP ${parseResponse.status}`);
            }

            const parseResult = await parseResponse.json();
            if (!parseResult.success) {
                throw new Error(parseResult.message);
            }

            // 执行导入
            const importResponse = await fetch('/api/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    accounts: parseResult.data.accounts,  // 只提取accounts数组
                    merge_mode: mergeMode.value
                })
            });

            if (!importResponse.ok) {
                throw new Error(`导入失败: HTTP ${importResponse.status}`);
            }

            const importResult = await importResponse.json();
            
            if (importResult.success) {
                this.showSuccess(`导入完成! 新增: ${importResult.added_count}, 更新: ${importResult.updated_count}, 跳过: ${importResult.skipped_count}`);
                // 清空导入内容
                document.getElementById('importTextarea').value = '';
                this.loadAccounts(); // 刷新账号列表
            } else {
                this.showError(`导入失败: ${importResult.message}`);
            }

        } catch (error) {
            console.error('导入失败:', error);
            this.showError(`导入失败: ${error.message}`);
        }
    }

    async exportData() {
        try {
            const response = await fetch('/api/admin/export', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                // 直接获取文本内容
                const content = await response.text();
                
                // 从响应头获取文件名
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'outlook_accounts_config.txt';
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename=(.+)/);
                    if (match) {
                        filename = match[1];
                    }
                }
                
                // 下载文件
                this.downloadTextFile(content, filename);
                this.showSuccess('数据导出成功，包含完整配置信息');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('导出失败:', error);
            this.showError(`导出失败: ${error.message}`);
        }
    }

    downloadTextFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    logout() {
        this.isAuthenticated = false;
        this.token = '';
        sessionStorage.removeItem('admin_token');
        
        document.getElementById('managementSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'block';
        
        // 清空表单
        document.getElementById('tokenInput').value = '';
        
        this.showSuccess('已安全退出管理');
    }

    showSuccess(message) {
        document.getElementById('successMessage').textContent = message;
        const modal = new bootstrap.Modal(document.getElementById('successModal'));
        modal.show();
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        const modal = new bootstrap.Modal(document.getElementById('errorModal'));
        modal.show();
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    window.adminManager = new AdminManager();
});