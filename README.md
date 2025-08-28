# Outlook邮件自动化管理系统

## 项目简介

这是一个改进版的Outlook邮件自动化管理系统，支持批量账户管理和前端界面操作。主要特性包括：

- **批量账户导入**: 支持从配置文件批量导入多个邮箱账户
- **Web前端界面**: 提供现代化的Web界面进行邮件管理
- **邮箱验证**: 输入邮箱地址验证是否存在于配置中
- **邮件列表查看**: 获取并显示指定邮箱的邮件列表
- **邮件详情查看**: 点击邮件查看详细内容
- **无需重新获取token**: 使用预配置的refresh_token，无需手动授权

## 系统架构

```
outlook-mail-automation-main/
├── mail_api.py          # 主程序文件（后端API + 命令行）
├── config.txt           # 批量账户配置文件
├── requirements.txt     # Python依赖包
├── static/              # 前端静态文件
│   ├── index.html      # 主页面
│   ├── style.css       # 样式文件
│   └── script.js       # 交互逻辑
└── README.md           # 使用说明（本文件）
```

## 安装配置

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置邮箱账户

编辑 `config.txt` 文件，按以下格式添加邮箱账户：

```
# 批量邮箱账户配置文件
# 格式：用户名----密码----client_id----refresh_token
# 每行一个账户，用----分隔各字段

user1@outlook.com----password123----your_client_id_1----your_refresh_token_1
user2@hotmail.com----password456----your_client_id_2----your_refresh_token_2
```

**重要说明：**
- 每行代表一个邮箱账户
- 字段间使用四个连字符 `----` 分隔
- 需要提前获取每个账户的 `client_id` 和 `refresh_token`
- 支持注释行（以#开头）和空行

## 使用方法

### Web界面模式（推荐）

1. 启动Web服务器：
```bash
python mail_api.py web
```

2. 打开浏览器访问：`http://localhost:5000`

3. 在前端界面中：
   - **输入邮箱地址** → 点击"验证邮箱"
   - **验证通过后** → 点击"获取邮件列表"
   - **查看邮件** → 点击邮件列表中的任意邮件查看详情

### 命令行模式

直接运行脚本测试配置：
```bash
python mail_api.py
```

## 功能特性

### 1. 邮箱验证
- 检查输入的邮箱是否在配置文件中存在
- 实时验证反馈

### 2. 邮件列表
- 获取最新的邮件列表（默认20封）
- 显示邮件主题、发件人、时间和预览
- 支持刷新功能

### 3. 邮件详情
- 完整的邮件内容展示
- 发件人、收件人、时间等详细信息
- 安全的HTML内容处理

### 4. 响应式设计
- 适配桌面和移动设备
- 现代化的Material Design界面
- 流畅的交互体验

## API接口

系统提供以下REST API接口：

### 验证邮箱
```
POST /api/verify-email
Content-Type: application/json

{
    "email": "user@example.com"
}
```

### 获取邮件列表
```
GET /api/messages?email=user@example.com&top=20
```

### 获取邮件详情
```
GET /api/message/{message_id}?email=user@example.com
```

## 错误排查

### 常见问题

1. **邮箱验证失败**
   - 检查邮箱地址是否正确
   - 确认邮箱在config.txt中存在
   - 验证配置文件格式是否正确

2. **获取邮件失败**
   - 检查refresh_token是否有效
   - 确认网络连接正常
   - 查看控制台错误日志

3. **服务器启动失败**
   - 确认Flask依赖已正确安装
   - 检查5000端口是否被占用
   - 验证Python版本兼容性

### 日志查看

程序运行时会在控制台输出详细日志：
- 邮箱验证状态
- API请求响应
- 错误信息和堆栈跟踪

## 安全注意事项

1. **配置文件安全**
   - config.txt包含敏感信息，请妥善保管
   - 不要将包含真实凭据的配置文件上传到公共仓库

2. **网络安全**
   - 建议在内网环境使用
   - 生产环境请使用HTTPS和正式的WSGI服务器

3. **Token管理**
   - 定期检查refresh_token的有效性
   - 及时更新过期的凭据

## 技术栈

- **后端**: Python Flask
- **前端**: HTML5 + Bootstrap 5 + JavaScript
- **API**: Microsoft Graph API
- **认证**: OAuth 2.0 with PKCE

## 更新日志

### v2.0.0 (当前版本)
- ✅ 支持批量账户配置
- ✅ 添加Web前端界面
- ✅ 实现邮箱验证功能
- ✅ 支持邮件列表和详情查看
- ✅ 响应式设计
- ✅ RESTful API接口

### v1.0.0 (原版本)
- 单账户配置
- 命令行操作
- 基础邮件收发功能

## 许可证

本项目基于MIT许可证开源。

## 支持

如有问题，请检查：
1. 配置文件格式是否正确
2. 依赖包是否完整安装
3. 网络连接是否正常
4. Microsoft Graph API权限是否正确配置