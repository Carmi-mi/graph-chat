#!/bin/bash

# 开发环境启动/重启脚本
# 使用方法：./start-dev.sh [start|stop|restart]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 进程 ID 文件
FRONTEND_PID_FILE=".frontend.pid"
BACKEND_PID_FILE=".backend.pid"

# 日志文件
FRONTEND_LOG="frontend.log"
BACKEND_LOG="backend.log"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查目录是否存在
check_directories() {
    if [ ! -d "frontend" ]; then
        echo -e "${RED}错误：frontend 目录不存在${NC}"
        exit 1
    fi
    if [ ! -d "backend" ]; then
        echo -e "${RED}错误：backend 目录不存在${NC}"
        exit 1
    fi
}

# 停止前端服务
stop_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        PID=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${YELLOW}停止前端服务 (PID: $PID)...${NC}"
            kill "$PID" 2>/dev/null || true
            # 等待进程结束
            for i in {1..10}; do
                if ! kill -0 "$PID" 2>/dev/null; then
                    break
                fi
                sleep 0.5
            done
            # 如果还在运行，强制杀死
            if kill -0 "$PID" 2>/dev/null; then
                echo -e "${YELLOW}强制停止前端服务...${NC}"
                kill -9 "$PID" 2>/dev/null || true
            fi
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
    # 清理可能残留的 node 进程（通过端口 5173）
    if command -v npx &> /dev/null; then
        npx kill-port 5173 2>/dev/null || true
    fi
}

# 停止后端服务
stop_backend() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        PID=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${YELLOW}停止后端服务 (PID: $PID)...${NC}"
            kill "$PID" 2>/dev/null || true
            # 等待进程结束
            for i in {1..10}; do
                if ! kill -0 "$PID" 2>/dev/null; then
                    break
                fi
                sleep 0.5
            done
            # 如果还在运行，强制杀死
            if kill -0 "$PID" 2>/dev/null; then
                echo -e "${YELLOW}强制停止后端服务...${NC}"
                kill -9 "$PID" 2>/dev/null || true
            fi
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    # 清理可能残留的 uvicorn 进程（通过端口 8000）
    if command -v npx &> /dev/null; then
        npx kill-port 8000 2>/dev/null || true
    fi
}

# 停止所有服务
stop_all() {
    stop_frontend
    stop_backend
    echo -e "${GREEN}所有服务已停止${NC}"
}

# 启动前端服务
start_frontend() {
    echo -e "${GREEN}启动前端服务...${NC}"
    cd frontend

    # 检查是否已安装依赖
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}安装前端依赖...${NC}"
        npm install
    fi

    # 启动开发服务器（后台运行）
    npm run dev > "../$FRONTEND_LOG" 2>&1 &
    echo $! > "../$FRONTEND_PID_FILE"
    cd "$SCRIPT_DIR"

    echo -e "${GREEN}前端服务已启动 (PID: $(cat "$FRONTEND_PID_FILE"))${NC}"
    echo -e "${GREEN}访问地址：http://localhost:5173${NC}"
    echo -e "${GREEN}日志文件：$FRONTEND_LOG${NC}"
}

# 启动后端服务
start_backend() {
    echo -e "${GREEN}启动后端服务...${NC}"
    cd backend

    # 检查是否已安装依赖
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}创建 Python 虚拟环境...${NC}"
        python -m venv venv
    fi

    # 激活虚拟环境
    if [ -f "venv/Scripts/activate" ]; then
        source venv/Scripts/activate
    elif [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    else
        echo -e "${RED}错误：找不到虚拟环境激活脚本${NC}"
        exit 1
    fi

    # 安装依赖
    if [ ! -d "venv/Lib/site-packages/fastapi" ] && [ ! -d "venv/lib/python*/site-packages/fastapi" ]; then
        echo -e "${YELLOW}安装后端依赖...${NC}"
        pip install -r requirements.txt
    fi

    # 启动 uvicorn 服务器（后台运行）
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > "../$BACKEND_LOG" 2>&1 &
    echo $! > "../$BACKEND_PID_FILE"
    cd "$SCRIPT_DIR"

    echo -e "${GREEN}后端服务已启动 (PID: $(cat "$BACKEND_PID_FILE"))${NC}"
    echo -e "${GREEN}访问地址：http://localhost:8000${NC}"
    echo -e "${GREEN}API 文档：http://localhost:8000/docs${NC}"
    echo -e "${GREEN}日志文件：$BACKEND_LOG${NC}"
}

# 启动所有服务
start_all() {
    check_directories
    start_frontend
    start_backend
    echo ""
    echo -e "${GREEN}所有服务已启动！${NC}"
    echo -e "${GREEN}前端：http://localhost:5173${NC}"
    echo -e "${GREEN}后端：http://localhost:8000${NC}"
    echo -e "${GREEN}API 文档：http://localhost:8000/docs${NC}"
    echo ""
    echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
}

# 重启所有服务
restart_all() {
    echo -e "${YELLOW}重启所有服务...${NC}"
    stop_all
    sleep 2
    start_all
}

# 显示状态
show_status() {
    echo -e "${GREEN}服务状态：${NC}"

    # 检查前端
    if [ -f "$FRONTEND_PID_FILE" ]; then
        PID=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${GREEN}前端服务：运行中 (PID: $PID)${NC}"
        else
            echo -e "${RED}前端服务：未运行${NC}"
        fi
    else
        echo -e "${RED}前端服务：未运行${NC}"
    fi

    # 检查后端
    if [ -f "$BACKEND_PID_FILE" ]; then
        PID=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo -e "${GREEN}后端服务：运行中 (PID: $PID)${NC}"
        else
            echo -e "${RED}后端服务：未运行${NC}"
        fi
    else
        echo -e "${RED}后端服务：未运行${NC}"
    fi
}

# 显示日志
show_logs() {
    echo -e "${GREEN}显示日志（按 Ctrl+C 退出）：${NC}"
    tail -f "$FRONTEND_LOG" "$BACKEND_LOG" 2>/dev/null || echo -e "${YELLOW}日志文件不存在${NC}"
}

# 清理函数（用于信号处理）
cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止服务...${NC}"
    stop_all
    exit 0
}

# 主函数
main() {
    # 注册信号处理
    trap cleanup SIGINT SIGTERM

    case "${1:-start}" in
        start)
            start_all
            # 等待所有子进程
            wait
            ;;
        stop)
            stop_all
            ;;
        restart)
            restart_all
            # 等待所有子进程
            wait
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        *)
            echo "用法：$0 {start|stop|restart|status|logs}"
            echo ""
            echo "命令："
            echo "  start    启动所有服务（默认）"
            echo "  stop     停止所有服务"
            echo "  restart  重启所有服务"
            echo "  status   显示服务状态"
            echo "  logs     显示实时日志"
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"