# Beacon

Beacon 是一个参考 Trello 体验设计的项目管理工具，用于在工作区内创建项目看板、列表和任务卡片，帮助团队围绕目标推进任务。

## 技术栈

- 前端：Next.js、React、Tailwind CSS
- 后端：Go、chi、GORM
- 数据库：默认 SQLite，支持通过环境变量切换到 MySQL 或 PostgreSQL

## 主要功能

- 邮箱密码注册和登录
- 工作区创建、重命名、删除
- 看板创建、星标、成员邀请
- 列表创建、重命名、删除
- 卡片创建、拖拽流转、删除
- 卡片任务字段：任务描述、预计完成时间、自动延期状态、任务执行人、优先级、任务情况总结
- 卡片隐藏字段：开始日期、实际完成日期、进展、最新进展记录
- 评论、搜索、多人看板实时刷新

## 本地启动

启动 API：

```bash
cd /Users/kavin/Coding/Beacon/apps/api
GOPROXY=https://goproxy.cn,direct go run ./cmd/server
```

启动 Web：

```bash
cd /Users/kavin/Coding/Beacon/apps/web
npm run dev -- --hostname 127.0.0.1 --port 3000
```

浏览器访问：

```text
http://127.0.0.1:3000
```

## 生产构建与启动

构建并启动 API：

```bash
cd /home/vip/yanyugang/beacon/apps/api
/usr/local/go/bin/go build -o server ./cmd/server
./server
```

说明：

- `go build -o beacon-server ./cmd/server` 只会在当前目录生成或覆盖 `beacon-server` 文件。
- 如果线上运行的不是这个文件，而是其他目录下的可执行文件，或由 `systemd` / `supervisor` / `pm2` 等托管，则还需要把新文件复制到实际部署位置，并重启对应服务。

构建并启动 Web：

```bash
cd /home/vip/yanyugang/beacon/apps/web
npm run build
npm run start
```

## 环境变量

API 默认监听 `8080` 端口，默认使用本地 SQLite：

```env
PORT=8080
CLIENT_ORIGIN=http://localhost:3000
JWT_SECRET=dev-only-change-me
DB_DRIVER=sqlite
DB_DSN=data/beacon.db
```

前端默认 API 地址：

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api
```

## 数据库切换

SQLite：

```env
DB_DRIVER=sqlite
DB_DSN=data/beacon.db
```

MySQL：

```env
DB_DRIVER=mysql
DB_DSN=beacon:beacon@tcp(127.0.0.1:3306)/beacon?charset=utf8mb4&parseTime=True&loc=Local
```

PostgreSQL：

```env
DB_DRIVER=postgres
DB_DSN=host=127.0.0.1 user=beacon password=beacon dbname=beacon port=5432 sslmode=disable TimeZone=Asia/Shanghai
```

## 开发检查

后端：

```bash
cd apps/api
go test ./...
```

前端：

```bash
cd apps/web
npm run typecheck
npm run lint
```
