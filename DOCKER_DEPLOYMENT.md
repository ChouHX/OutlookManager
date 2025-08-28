# Outlook邮件管理系统 - Docker部署指南

## 系统要求

- Docker Engine 20.10+
- Docker Compose 2.0+
- 至少 512MB RAM
- 1GB 可用磁盘空间

## 快速部署

### 方法一：使用 Docker Compose（推荐）

1. **克隆或下载项目文件**
   ```bash
   # 如果有git仓库
   git clone <repository-url>
   cd outlook-mail-automation-main
   
   # 或者直接下载并解压项目文件
   ```

2. **配置环境变量（可选）**
   ```bash
   # 复制环境变量示例文件
   cp .env.example .env
   
   # 编辑环境变量文件
   nano .env
   ```

3. **准备配置文件**
   ```bash
   # 确保config.txt文件存在，并添加邮箱配置
   # 格式：邮箱----密码----client_id----refresh_token
   echo "your_email@hotmail.com----password----dbc8e03a-b00c-46bd-ae65-b683e7707cb0----your_refresh_token" > config.txt
   ```

4. **启动服务**
   ```bash
   # 构建并启动容器
   docker-compose up -d
   
   # 查看日志
   docker-compose logs -f
   ```

5. **访问系统**
   - 主界面：http://localhost:5000
   - 管理界面：http://localhost:5000/admin

### 方法二：使用 Docker 命令

1. **构建镜像**
   ```bash
   docker build -t outlook-mail-system .
   ```

2. **运行容器**
   ```bash
   docker run -d \
     --name outlook-mail-automation \
     -p 5000:5000 \
     -v $(pwd)/config.txt:/app/config.txt \
     -e ADMIN_TOKEN=your_secure_password \
     outlook-mail-system
   ```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ADMIN_TOKEN` | `admin123` | 管理页面访问令牌 |
| `SERVER_PORT` | `5000` | 服务器端口 |
| `SERVER_HOST` | `0.0.0.0` | 服务器主机 |
| `TZ` | `Asia/Shanghai` | 时区设置 |
| `LOG_LEVEL` | `INFO` | 日志级别 |

### 配置文件

**config.txt 格式：**
```
# 批量邮箱账户配置文件
# 格式：用户名----密码----client_id----refresh_token
# 每行一个账户，用----分隔各字段

your_email1@hotmail.com----password1----dbc8e03a-b00c-46bd-ae65-b683e7707cb0----refresh_token1
your_email2@outlook.com----password2----dbc8e03a-b00c-46bd-ae65-b683e7707cb0----refresh_token2
```

## 常用操作

### 查看容器状态
```bash
docker-compose ps
```

### 查看日志
```bash
# 查看所有日志
docker-compose logs

# 实时查看日志
docker-compose logs -f

# 查看最近100行日志
docker-compose logs --tail=100
```

### 重启服务
```bash
docker-compose restart
```

### 停止服务
```bash
docker-compose down
```

### 更新系统
```bash
# 停止当前服务
docker-compose down

# 重新构建镜像
docker-compose build --no-cache

# 启动新版本
docker-compose up -d
```

### 备份配置
```bash
# 备份配置文件
cp config.txt config.txt.backup.$(date +%Y%m%d_%H%M%S)
```

## 安全建议

1. **修改默认密码**
   ```bash
   # 修改 .env 文件中的 ADMIN_TOKEN
   ADMIN_TOKEN=your_very_secure_password_here
   ```

2. **限制网络访问**
   ```yaml
   # 在 docker-compose.yml 中只绑定本地地址
   ports:
     - "127.0.0.1:5000:5000"
   ```

3. **使用HTTPS代理**
   ```bash
   # 建议使用 Nginx 或 Traefik 作为反向代理
   # 配置 SSL 证书
   ```

4. **定期备份**
   ```bash
   # 定期备份配置文件和日志
   crontab -e
   # 添加：0 2 * * * cp /path/to/config.txt /backup/config.txt.$(date +\%Y\%m\%d)
   ```

## 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   # 检查日志
   docker-compose logs
   
   # 检查端口占用
   netstat -tulpn | grep :5000
   ```

2. **无法访问邮件**
   ```bash
   # 检查refresh_token是否有效
   # 重新运行 get_refresh_token.py 获取新的token
   ```

3. **内存不足**
   ```bash
   # 增加Docker内存限制
   docker-compose up -d --scale outlook-mail-system=1 --memory="1g"
   ```

4. **网络连接问题**
   ```bash
   # 检查容器网络
   docker network ls
   docker network inspect outlook-mail-automation_outlook-mail-network
   ```

### 日志分析

```bash
# 查看错误日志
docker-compose logs | grep ERROR

# 查看IMAP连接日志
docker-compose logs | grep IMAP

# 查看API请求日志
docker-compose logs | grep "HTTP/1.1"
```

## 性能优化

1. **调整工作进程数量**
   ```bash
   # 修改启动命令（在Dockerfile中）
   CMD ["uvicorn", "mail_api:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "2"]
   ```

2. **限制资源使用**
   ```yaml
   # 在 docker-compose.yml 中添加
   deploy:
     resources:
       limits:
         memory: 512M
         cpus: '0.5'
   ```

3. **启用缓存**
   ```bash
   # 可以考虑添加Redis缓存（未来版本）
   ```

## 维护和监控

### 健康检查
```bash
# 检查健康状态
docker-compose ps
curl -f http://localhost:5000/
```

### 监控指标
```bash
# 查看容器资源使用
docker stats outlook-mail-automation

# 查看磁盘使用
docker system df
```

### 日志轮转
```yaml
# 在 docker-compose.yml 中添加日志配置
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 联系支持

如果遇到问题，请：
1. 查看本文档的故障排除部分
2. 检查项目日志
3. 提供详细的错误信息和环境配置